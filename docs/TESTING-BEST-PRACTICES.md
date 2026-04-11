---
title: TESTING-BEST-PRACTICES - Mejores Prácticas de Testing
description: Mejores prácticas para escribir tests
tags: [testing, guide]
lastUpdated: 2026-04-10
author: human
---

# Testing Best Practices

## General Principles

1. **Test Behavior, Not Implementation**
   - Test what the user/agent sees and does
   - Don't test internal state or private methods

2. **One Assertion Per Test (尽量)**
   - Each test should verify one specific behavior
   - Multiple assertions OK if they test the same behavior

3. **Use Descriptive Test Names**
   ```typescript
   // ✅ Good
   it('creates a task with todo status when no status provided')
   it('rejects requests without authorization header')
   
   // ❌ Bad
   it('test 1')
   it('create task')
   ```

4. **AAA Pattern: Arrange, Act, Assert**
   ```typescript
   it('marks task as done', async () => {
     // Arrange: create a task
     const taskId = await createTask({ title: 'Test' });
     
     // Act: mark it done
     await markTaskDone(taskId);
     
     // Assert
     const task = await getTask(taskId);
     expect(task.status).toBe('done');
   });
   ```

## Convex-Specific Patterns

### Use withIdentity for Auth Tests
```typescript
const asSarah = t.withIdentity({ name: 'Sarah', email: 'sarah@example.com' });
await asSarah.mutation(api.tasks.create, { ... });
```

### Test Edge Cases
```typescript
// Empty state
it('returns empty array when no tasks exist', async () => { ... });

// Single item
it('returns single task when only one exists', async () => { ... });

// Many items (pagination)
it('returns first 100 tasks when more exist', async () => { ... });

// Invalid input
it('throws when entityId is invalid', async () => { ... });
```

### Test Access Control Explicitly
```typescript
it('allows owner to update their task', async () => {
  const asOwner = t.withIdentity({ name: 'Owner' });
  await asOwner.mutation(api.tasks.update, { id: taskId, title: 'New' });
});

it('rejects non-owner update attempt', async () => {
  const asOther = t.withIdentity({ name: 'Other' });
  await expect(
    asOther.mutation(api.tasks.update, { id: taskId, title: 'Hack' })
  ).rejects.toThrow('Not authorized');
});
```

## Mocking Best Practices

### Mock at the Boundary
```typescript
// ✅ Good - mock external service
vi.stubGlobal('fetch', mockFetchFn);

// ❌ Bad - mock internals
vi.spyOn(internalModule, 'helperFunction');
```

### Reset Mocks Between Tests
```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

### Don't Over-Mock
```typescript
// ✅ Good - mock only what you control
vi.mock('./convex');

// ❌ Bad - mocking everything
vi.mock('openai');
vi.mock('stripe');
vi.mock('sendgrid');
```

## Common Mistakes

### 1. Testing with Wrong Auth Context
```typescript
// ❌ Wrong - no identity means no auth
const tasks = await t.query(api.tasks.list, {});

// ✅ Correct - with identity
const asUser = t.withIdentity({ name: 'User', email: 'user@test.com' });
const tasks = await asUser.query(api.tasks.list, {});
```

### 2. Not Waiting for Async
```typescript
// ❌ Wrong
await t.mutation(api.tasks.create, { ... });
const tasks = await t.query(api.tasks.list, {}); // Might not see new task yet!

// ✅ Correct - Convex is usually fast but be aware
// In real tests, Convex operations are synchronous within the test runtime
```

### 3. Forgetting to Create Required Entities
```typescript
// ❌ Wrong - tasks require an entityId
await t.mutation(api.tasks.create, { title: 'Orphan' }); // Will fail!

// ✅ Correct - create entity first
const entityId = await t.run(async ctx => ctx.db.insert('entities', {...}));
await t.mutation(api.tasks.create, { entityId, title: 'With Entity' });
```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx convex dev --typecheck --disable
      - run: npm test
```

## Coverage Targets

| Layer | Target | Why |
|-------|--------|-----|
| Convex queries/mutations | 80%+ | Core business logic |
| MCP tools | 90%+ | Security critical |
| React components | 60%+ | UI logic |
| Auth flows | 100%+ | Security critical |

## When to Write Tests

1. **Before writing new features** - TDD
2. **When fixing bugs** - Write test that reproduces bug first
3. **Before refactoring** - Ensure tests pass after
4. **For critical paths** - Auth, payments, data integrity
5. **For public APIs** - MCP tools, HTTP endpoints

## Continue Learning

- [Vitest Docs](https://vitest.dev/)
- [Testing Library Docs](https://testing-library.com/)
- [Convex Testing](https://docs.convex.dev/functions/testing)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol)