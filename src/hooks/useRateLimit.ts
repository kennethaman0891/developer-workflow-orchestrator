// Rate Limiting Hook
//
// Client-side rate limiting for authentication operations.
// Uses token bucket algorithm with localStorage persistence.

import { useState, useCallback, useRef, useEffect } from 'react';

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
 * Token bucket rate limiter hook.
 * Persists state in localStorage to survive page reloads.
 */
export function useRateLimit(config: RateLimitConfig) {
  const { capacity, refillRate, key } = config;
  const storageKey = `dwo_ratelimit_${key}`;
  
  const [state, setState] = useState<RateLimitState>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          tokens: parsed.tokens ?? capacity,
          lastRefill: parsed.lastRefill ?? Date.now(),
        };
      }
    } catch {}
    return { tokens: capacity, lastRefill: Date.now() };
  });
  
  const stateRef = useRef(state);
  stateRef.current = state;
  
  // Persist state changes
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);
  
  const refill = useCallback(() => {
    const now = Date.now();
    const elapsed = (now - stateRef.current.lastRefill) / 1000; // seconds
    const newTokens = Math.min(capacity, stateRef.current.tokens + elapsed * refillRate);
    return { tokens: newTokens, lastRefill: now };
  }, [capacity, refillRate]);
  
  const check = useCallback((tokens: number = 1): boolean => {
    const refilled = refill();
    if (refilled.tokens >= tokens) {
      const next = { ...refilled, tokens: refilled.tokens - tokens };
      setState(next);
      return true;
    }
    setState(refilled);
    return false;
  }, [refill]);
  
  const available = useCallback((): number => {
    const refilled = refill();
    return Math.floor(refilled.tokens);
  }, [refill]);
  
  const reset = useCallback(() => {
    setState({ tokens: capacity, lastRefill: Date.now() });
  }, [capacity]);
  
  const remove = useCallback(() => {
    localStorage.removeItem(storageKey);
    setState({ tokens: capacity, lastRefill: Date.now() });
  }, [capacity, storageKey]);
  
  return { check, available, reset, remove };
}
