# Agent Auth Implementation Findings

## 1. Node.js Crypto API in Convex

### Issue Found
Convex queries and mutations run in Convex's JavaScript runtime, not Node.js. The standard Node.js `crypto` module is not available by default.

### Problem
Original implementation used `import * as crypto from "crypto"` which failed with:
```
Could not resolve "crypto"
```

### Solution
Rewrote `agentJwt.ts` to use Web Crypto API instead:
- Used `crypto.subtle.importKey()` for HMAC signing
- Used `crypto.randomUUID()` for UUID generation
- Implemented custom base64url encoding/decoding

### Alternatives Considered
1. **"use node" directive**: Only works for Actions, not Queries/Mutations
2. **Split into Node action + Query wrapper**: Would add complexity
3. **Use Convex's built-in functions**: No built-in JWT/crypto support

---

## 2. Async JWT Functions

### Issue Found
The Web Crypto API functions (`createSignature`, `verifySignature`) are async, but Convex handlers need to handle promises properly.

### Problem
`generateAccessToken()` and `verifyAccessToken()` became async, requiring `await` in mutation handlers.

### Solution
All handlers in `agents.ts` and `auth.ts` are already async-capable, so simply added `await` where needed.

---

## 3. Type Casting for Claims

### Issue Found
JWT claims have `ownerId` and `scopeEntityIds` as `string[]` types, but Convex schema uses `Id<"users">` and `Id<"entities">[]`.

### Problem
TypeScript errors like:
```
Argument of type 'string' is not assignable to parameter of type 'Id<"users">'
```

### Solution
Used double-cast pattern:
```typescript
claims.ownerId as Id<"users">
(claims.scopeEntityIds ?? []) as Id<"entities">[]
```

---

## 4. Auth Context in Permissions

### Issue Found
`getCurrentUserFromAgentToken()` was designed to work with both QueryCtx and MutationCtx, but `ctx.db.patch()` is only available on MutationCtx.

### Problem
```
Property 'patch' does not exist on type 'GenericDatabaseReader'
```

### Solution
Split into two functions:
- `getCurrentUserFromAgentToken(ctx: QueryCtx, ...)` - returns user and claims
- `updateAgentTokenLastUsed(ctx: MutationCtx, ...)` - updates lastUsedAt

Callers must use the appropriate function based on context.

---

## 5. Token Hashing Algorithm

### Issue Found
The Web Crypto API doesn't have a simple `crypto.createHash()` equivalent for arbitrary strings.

### Problem
Needed a deterministic hash function for token lookup that works in browser/Convex runtime.

### Solution
Implemented a simple string-based hash:
```typescript
export function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // ... additional mixing for better distribution
}
```

### Note
This is NOT cryptographically secure, but serves for token lookup purposes. For production, consider using Web Crypto's SHA-256 via `crypto.subtle.digest()`.

---

## 6. Security Architecture

### Critical Rule Enforced
**"AN AGENT CAN NEVER SEE RESOURCES FROM ANOTHER OWNER"**

This is enforced at multiple levels:

1. **JWT Claims**: `ownerId` claim identifies the human owner
2. **Token Validation**: `agent_tokens` table links token to owner
3. **Query Level**: All queries filter by `ownerId` or `scopeEntityIds`
4. **Permission Helpers**: `canAccessEntity()` and `filterAccessibleEntities()`

### Access Control Matrix

| Role | Orchestrator | Entity-Scoped | Sub-Agent |
|------|-------------|---------------|-----------|
| Human | Full access to own entities | N/A | N/A |
| Agent | All entities of owner | Only scoped entities | Only scoped entities |
| Admin | All entities | All entities | All entities |

---

## 7. Missing Pieces in Original Design

### Issue: Token Identifier Pattern
The handover document shows `sub: "agent_user_id"` but the implementation uses `tokenIdentifier: "agent_<timestamp>_<random>"`.

### Issue: getCurrentUserFromAgentToken Lookup
The lookup uses `agent_${claims.sub}` as tokenIdentifier, but this assumes `claims.sub` contains the user ID portion without prefix.

### Solution
The `createAgent` mutation stores `tokenIdentifier` as `agent_<timestamp>_<random>` and returns the `agentUserId`. The JWT `sub` claim stores just the agent user ID. So the lookup correctly uses `agent_${claims.sub}` to reconstruct the tokenIdentifier.

---

## 8. Frontend Integration

### Issue: AgentsView Not Added to Navigation
The AgentsView component was created but not integrated into the main Layout/navigation.

### Recommendation
Add Agents to navigation in `Layout.tsx` similar to other views.

### Issue: Copy-to-Clipboard Shows Token ID
The AgentsView copies `token._id` (the Convex document ID) not the actual JWT. This is a placeholder - actual JWTs should be returned from `createAgent` and stored by the frontend.

---

## 9. Testing Recommendations

1. Test JWT generation/verification without Convex first
2. Test token refresh flow manually
3. Verify ownerId scoping by creating agents from two different users
4. Test revocation cascade - verify all tokens are revoked when agent is revoked

---

## 10. Future Improvements

1. **Cryptographically secure token hashing**: Use Web Crypto SHA-256
2. **Token rotation**: Add support for multiple valid tokens per agent
3. **Audit logging**: Track all token usage
4. **Rate limiting**: Prevent brute-force token attacks
5. **Expiration cleanup**: Add Convex cron to clean expired tokens
