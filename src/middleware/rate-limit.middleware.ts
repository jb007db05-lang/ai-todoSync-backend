import rateLimit from "express-rate-limit";

/**
 * Global rate limiter middleware
 * Limits to 25 requests per second (1500 per minute)
 */
export const globalRateLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: "Too many requests, please try again later.",
    status: 429,
  },
});
