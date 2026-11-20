export type RateLimitPolicy = Readonly<{
  maxRequests: number;
  windowSeconds: number;
}>;

export const apiRateLimitPolicies = {
  setupOwner: { maxRequests: 5, windowSeconds: 15 * 60 },
  authenticatedWrites: { maxRequests: 600, windowSeconds: 60 },
  dataExports: { maxRequests: 3, windowSeconds: 60 * 60 },
  documentImports: { maxRequests: 20, windowSeconds: 60 * 60 },
  courtSync: { maxRequests: 12, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

async function bucketKey(secret: string, dimensions: readonly string[]): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(JSON.stringify(["marcia-api-rate-limit-v1", ...dimensions])),
  ));
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Atomically consumes a fixed-window counter shared across Worker isolates.
 * Only an HMAC of the scope and identity is stored in D1; client IPs and
 * account identifiers are never written to the rate-limit table in plaintext.
 */
export async function consumeD1RateLimit(
  db: D1Database,
  secret: string,
  dimensions: readonly string[],
  policy: RateLimitPolicy,
  nowMilliseconds = Date.now(),
): Promise<RateLimitResult> {
  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  const windowStart = Math.floor(nowSeconds / policy.windowSeconds) * policy.windowSeconds;
  const key = await bucketKey(secret, dimensions);
  const row = await db.prepare(`
    INSERT INTO api_rate_limits (bucket_key, window_start, request_count)
    VALUES (?1, ?2, 1)
    ON CONFLICT (bucket_key) DO UPDATE SET
      request_count = CASE
        WHEN api_rate_limits.window_start = excluded.window_start
          THEN MIN(api_rate_limits.request_count + 1, ?3)
        ELSE 1
      END,
      window_start = excluded.window_start
    RETURNING request_count
  `).bind(key, windowStart, policy.maxRequests + 1).first<{ request_count: number }>();

  if (!row || !Number.isSafeInteger(row.request_count) || row.request_count < 1) {
    throw new Error("Rate limit counter unavailable");
  }

  const allowed = row.request_count <= policy.maxRequests;
  return {
    allowed,
    remaining: allowed ? policy.maxRequests - row.request_count : 0,
    retryAfterSeconds: Math.max(1, windowStart + policy.windowSeconds - nowSeconds),
  };
}
