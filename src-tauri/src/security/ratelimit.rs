//! Security: Rate Limiting
//!
//! Token bucket rate limiter for authentication and sensitive operations.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Rate limiter using token bucket algorithm
pub struct RateLimiter {
    buckets: Mutex<HashMap<String, TokenBucket>>,
    default_capacity: u32,
    default_refill_rate: f64, // tokens per second
}

struct TokenBucket {
    tokens: f64,
    capacity: u32,
    refill_rate: f64, // tokens per second
    last_refill: Instant,
}

impl TokenBucket {
    fn new(capacity: u32, refill_rate: f64) -> Self {
        Self {
            tokens: capacity as f64,
            capacity,
            refill_rate,
            last_refill: Instant::now(),
        }
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        let new_tokens = elapsed * self.refill_rate;
        self.tokens = (self.tokens + new_tokens).min(self.capacity as f64);
        self.last_refill = now;
    }

    fn try_consume(&mut self, tokens: u32) -> bool {
        self.refill();
        if self.tokens >= tokens as f64 {
            self.tokens -= tokens as f64;
            true
        } else {
            false
        }
    }

    fn available(&mut self) -> u32 {
        self.refill();
        self.tokens.floor() as u32
    }

    fn reset(&mut self) {
        self.tokens = self.capacity as f64;
        self.last_refill = Instant::now();
    }
}

impl RateLimiter {
    pub fn new(default_capacity: u32, default_refill_rate: f64) -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
            default_capacity,
            default_refill_rate,
        }
    }

    /// Try to consume tokens for a key. Returns true if allowed.
    pub fn check(&self, key: &str, tokens: u32) -> bool {
        let mut buckets = self.buckets.lock().unwrap();
        let bucket = buckets
            .entry(key.to_string())
            .or_insert_with(|| TokenBucket::new(self.default_capacity, self.default_refill_rate));
        bucket.try_consume(tokens)
    }

    /// Get available tokens for a key
    pub fn available(&self, key: &str) -> u32 {
        let mut buckets = self.buckets.lock().unwrap();
        let bucket = buckets
            .entry(key.to_string())
            .or_insert_with(|| TokenBucket::new(self.default_capacity, self.default_refill_rate));
        bucket.available()
    }

    /// Reset a key's bucket (e.g., after successful auth)
    pub fn reset(&self, key: &str) {
        let mut buckets = self.buckets.lock().unwrap();
        if let Some(bucket) = buckets.get_mut(key) {
            bucket.reset();
        }
    }

    /// Remove a key's bucket (cleanup)
    pub fn remove(&self, key: &str) {
        let mut buckets = self.buckets.lock().unwrap();
        buckets.remove(key);
    }

    /// Clean up old buckets (call periodically)
    pub fn cleanup(&self, max_age: Duration) {
        let mut buckets = self.buckets.lock().unwrap();
        let now = Instant::now();
        buckets.retain(|_, bucket| now.duration_since(bucket.last_refill) < max_age);
    }
}

/// Pre-configured rate limiters for different operations
pub struct AuthRateLimiter {
    /// Login attempts: 5 per minute, burst of 3
    pub login: RateLimiter,
    /// Registration: 3 per hour
    pub register: RateLimiter,
    /// Password reset: 2 per hour
    pub password_reset: RateLimiter,
    /// Email verification: 5 per hour
    pub email_verification: RateLimiter,
    /// Generic API: 60 per minute
    pub api: RateLimiter,
}

impl Default for AuthRateLimiter {
    fn default() -> Self {
        Self {
            // 5 per minute = 5/60 per sec, burst 5
            login: RateLimiter::new(5, 5.0 / 60.0),
            // 3 per hour
            register: RateLimiter::new(3, 3.0 / 3600.0),
            // 2 per hour
            password_reset: RateLimiter::new(2, 2.0 / 3600.0),
            // 5 per hour
            email_verification: RateLimiter::new(5, 5.0 / 3600.0),
            // 60 per minute
            api: RateLimiter::new(60, 1.0),
        }
    }
}

impl AuthRateLimiter {
    /// Check login rate limit (by IP or email)
    pub fn check_login(&self, identifier: &str) -> Result<(), String> {
        if self.login.check(identifier, 1) {
            Ok(())
        } else {
            let available = self.login.available(identifier);
            Err(format!("Rate limited. Try again later. Available: {}", available))
        }
    }

    /// Check registration rate limit
    pub fn check_register(&self, identifier: &str) -> Result<(), String> {
        if self.register.check(identifier, 1) {
            Ok(())
        } else {
            Err("Registration rate limit exceeded. Try again later.".to_string())
        }
    }

    /// Check generic API rate limit
    pub fn check_api(&self, identifier: &str) -> Result<(), String> {
        if self.api.check(identifier, 1) {
            Ok(())
        } else {
            Err("API rate limit exceeded".to_string())
        }
    }

    /// Reset login bucket on successful login
    pub fn reset_login(&self, identifier: &str) {
        self.login.reset(identifier);
    }
}

/// Global rate limiter instance
static RATE_LIMITER: OnceLock<AuthRateLimiter> = OnceLock::new();

pub fn init_rate_limiter() -> &'static AuthRateLimiter {
    RATE_LIMITER.get_or_init(AuthRateLimiter::default)
}

pub fn rate_limiter() -> &'static AuthRateLimiter {
    init_rate_limiter()
}

use std::sync::OnceLock;
