// Rate Limiter Utility (Non-Hook)
//
// Token bucket rate limiter for use in any context (not just React components).
// Uses localStorage for persistence.

interface RateLimitConfig {
  capacity: number;        // Max tokens in bucket
  refillRate: number;      // Tokens per second
  key: string;             // Unique identifier for this limiter
}

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

/**
 * Token bucket rate limiter class.
 * Persists state in localStorage to survive page reloads.
 */
export class RateLimiter {
  private state: RateLimitState;
  private storageKey: string;
  private capacity: number;
  private refillRate: number;

  constructor(config: RateLimitConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.storageKey = `dwo_ratelimit_${config.key}`;
    
    // Load initial state from localStorage
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = {
          tokens: parsed.tokens ?? this.capacity,
          lastRefill: parsed.lastRefill ?? Date.now(),
        };
        return;
      }
    } catch {}
    this.state = { tokens: this.capacity, lastRefill: Date.now() };
  }

  private refill(): RateLimitState {
    const now = Date.now();
    const elapsed = (now - this.state.lastRefill) / 1000; // seconds
    const newTokens = Math.min(this.capacity, this.state.tokens + elapsed * this.refillRate);
    this.state = { tokens: newTokens, lastRefill: now };
    return this.state;
  }

  private persist(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  /**
   * Check if tokens are available and consume them.
   * Returns true if allowed, false if rate limited.
   */
  check(tokens: number = 1): boolean {
    this.refill();
    if (this.state.tokens >= tokens) {
      this.state.tokens -= tokens;
      this.persist();
      return true;
    }
    this.persist();
    return false;
  }

  /**
   * Get the number of available tokens (after refill).
   */
  available(): number {
    this.refill();
    return Math.floor(this.state.tokens);
  }

  /**
   * Reset the limiter to full capacity.
   */
  reset(): void {
    this.state = { tokens: this.capacity, lastRefill: Date.now() };
    this.persist();
  }

  /**
   * Remove the limiter from localStorage.
   */
  remove(): void {
    localStorage.removeItem(this.storageKey);
    this.state = { tokens: this.capacity, lastRefill: Date.now() };
  }
}

/**
 * Pre-configured rate limiters for auth operations.
 */
export const authRateLimiters = {
  /** Login: 5 attempts per minute */
  login: (identifier: string) => new RateLimiter({
    key: `login_${identifier}`,
    capacity: 5,
    refillRate: 5 / 60, // 5 per minute
  }),
  
  /** Registration: 3 attempts per hour */
  register: (identifier: string) => new RateLimiter({
    key: `register_${identifier}`,
    capacity: 3,
    refillRate: 3 / 3600, // 3 per hour
  }),
  
  /** Password reset: 2 attempts per hour */
  passwordReset: (identifier: string) => new RateLimiter({
    key: `password_reset_${identifier}`,
    capacity: 2,
    refillRate: 2 / 3600, // 2 per hour
  }),
  
  /** Email verification: 5 attempts per hour */
  emailVerification: (identifier: string) => new RateLimiter({
    key: `email_verification_${identifier}`,
    capacity: 5,
    refillRate: 5 / 3600, // 5 per hour
  }),
};

/**
 * Helper for login rate limiting with user-friendly messages.
 */
export function tryLoginRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const limiter = authRateLimiters.login(identifier);
  
  if (limiter.check()) {
    return { allowed: true };
  }
  const available = limiter.available();
  if (available === 0) {
    // Estimate time until next token
    const retryAfter = Math.ceil(60 / 5); // ~12 seconds for 5/min
    return { allowed: false, retryAfter };
  }
  return { allowed: false };
}

export function onLoginSuccessRateLimit(identifier: string): void {
  const limiter = authRateLimiters.login(identifier);
  limiter.reset();
}
