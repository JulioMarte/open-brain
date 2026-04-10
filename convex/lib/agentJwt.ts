const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
const JWT_ALGORITHM = "HS256";

export interface AgentTokenClaims {
  sub: string;
  ownerId: string;
  scope: "orchestrator" | "entity_scoped" | "sub_agent";
  scopeEntityIds?: string[];
  iat: number;
  exp: number;
  jti: string;
  type: "access" | "refresh";
}

export interface RefreshTokenClaims extends AgentTokenClaims {
  type: "refresh";
  refreshTokenId: string;
}

function base64UrlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64UrlDecode(data: string): ArrayBuffer {
  let base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function createSignature(header: ArrayBuffer, payload: ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, concatBuffers(header, payload));
  return base64UrlEncode(signature);
}

function concatBuffers(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
  const result = new Uint8Array(a.byteLength + b.byteLength);
  result.set(new Uint8Array(a), 0);
  result.set(new Uint8Array(b), a.byteLength);
  return result.buffer;
}

async function verifySignature(header: ArrayBuffer, payload: ArrayBuffer, signature: string): Promise<boolean> {
  const expectedSignature = await createSignature(header, payload);
  const sigBuffer = base64UrlDecode(signature);
  const expectedBuffer = base64UrlDecode(expectedSignature);
  
  if (sigBuffer.byteLength !== expectedBuffer.byteLength) return false;
  
  const sigArray = new Uint8Array(sigBuffer);
  const expectedArray = new Uint8Array(expectedBuffer);
  
  let result = 0;
  for (let i = 0; i < sigArray.length; i++) {
    result |= sigArray[i] ^ expectedArray[i];
  }
  return result === 0;
}

export async function generateAccessToken(
  agentUserId: string,
  ownerId: string,
  scope: "orchestrator" | "entity_scoped" | "sub_agent",
  scopeEntityIds?: string[],
  expiresInSeconds: number = 3600
): Promise<string> {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  const payload: AgentTokenClaims = {
    sub: agentUserId,
    ownerId,
    scope,
    scopeEntityIds,
    iat: now,
    exp: now + expiresInSeconds,
    jti,
    type: "access",
  };

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(JSON.stringify({ alg: JWT_ALGORITHM, typ: "JWT" }));
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  
  const signature = await createSignature(headerBytes.buffer, payloadBytes.buffer);
  const header = base64UrlEncode(headerBytes.buffer);
  const payloadEncoded = base64UrlEncode(payloadBytes.buffer);

  return `${header}.${payloadEncoded}.${signature}`;
}

export async function generateRefreshToken(
  agentUserId: string,
  ownerId: string,
  scope: "orchestrator" | "entity_scoped" | "sub_agent",
  refreshTokenId: string,
  expiresInSeconds: number = 604800
): Promise<string> {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  const payload: RefreshTokenClaims = {
    sub: agentUserId,
    ownerId,
    scope,
    iat: now,
    exp: now + expiresInSeconds,
    jti,
    type: "refresh",
    refreshTokenId,
  };

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(JSON.stringify({ alg: JWT_ALGORITHM, typ: "JWT" }));
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  
  const signature = await createSignature(headerBytes.buffer, payloadBytes.buffer);
  const header = base64UrlEncode(headerBytes.buffer);
  const payloadEncoded = base64UrlEncode(payloadBytes.buffer);

  return `${header}.${payloadEncoded}.${signature}`;
}

export async function verifyAccessToken(token: string): Promise<AgentTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerB64, payloadB64, signature] = parts;

  const headerBuffer = base64UrlDecode(headerB64);
  const payloadBuffer = base64UrlDecode(payloadB64);

  if (!await verifySignature(headerBuffer, payloadBuffer, signature)) {
    throw new Error("Invalid token signature");
  }

  const decoder = new TextDecoder();
  const payloadData = JSON.parse(decoder.decode(payloadBuffer)) as AgentTokenClaims;
  
  if (payloadData.type !== "access") {
    throw new Error("Token is not an access token");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payloadData.exp < now) {
    throw new Error("Token has expired");
  }

  return payloadData;
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerB64, payloadB64, signature] = parts;

  const headerBuffer = base64UrlDecode(headerB64);
  const payloadBuffer = base64UrlDecode(payloadB64);

  if (!await verifySignature(headerBuffer, payloadBuffer, signature)) {
    throw new Error("Invalid token signature");
  }

  const decoder = new TextDecoder();
  const payloadData = JSON.parse(decoder.decode(payloadBuffer)) as RefreshTokenClaims;
  
  if (payloadData.type !== "refresh") {
    throw new Error("Token is not a refresh token");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payloadData.exp < now) {
    throw new Error("Refresh token has expired");
  }

  return payloadData;
}

export function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const str = Math.abs(hash).toString(16) + token;
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    result += ((char >> 4) & 0xF).toString(16) + (char & 0xF).toString(16);
  }
  return result;
}

export function getTokenExpiration(scope: "orchestrator" | "entity_scoped" | "sub_agent"): number {
  const now = Math.floor(Date.now() / 1000);
  switch (scope) {
    case "orchestrator":
      return now + 7 * 24 * 60 * 60;
    case "entity_scoped":
      return now + 24 * 60 * 60;
    case "sub_agent":
      return now + 30 * 60;
    default:
      return now + 3600;
  }
}

export function getRefreshTokenExpiration(): number {
  return Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
}