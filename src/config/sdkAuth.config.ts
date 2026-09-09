export const sdkAuthConfig = {
  // Session lifetime (default 15 minutes)
  sessionLifetimeMs: 15 * 60 * 1000,

  // Absolute maximum session lifetime (default 2 hours)
  maxSessionLifetimeMs: 2 * 60 * 60 * 1000,

  // Allowed clock skew (default 5 minutes)
  allowedClockSkewMs: 5 * 60 * 1000,

  // Maximum nonce lifetime (default 5 minutes)
  maxNonceLifetimeMs: 5 * 60 * 1000,

  // HMAC algorithm (default SHA-256)
  hmacAlgorithm: "sha256",

  // Rate limits for authentication endpoint (attempts per minute)
  maxAuthAttemptsPerMin: 10,

  // General SDK requests rate limit per window
  rateLimitWindowMs: 60 * 1000,
  maxRequestsPerWindow: 300,
};
