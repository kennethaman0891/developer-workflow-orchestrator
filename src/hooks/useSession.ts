// Session Management Hook
//
// Client-side session management with expiration and automatic refresh.

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  totalUsers: number;
}

const SESSION_CHECK_INTERVAL = 60000; // 1 minute
const SESSION_WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry

/**
 * Session management hook.
 * Syncs with backend session manager via Tauri commands.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const checkIntervalRef = useRef<any>(undefined);
  const warningTimeoutRef = useRef<any>(undefined);
  
  // Validate session with backend
  const validate = useCallback(async (sessionId: string): Promise<Session | null> => {
    try {
      const result = await invoke<Session>('session_validate', { sessionId });
      return result;
    } catch (err) {
      console.error('Session validation failed:', err);
      return null;
    }
  }, []);
  
  // Create new session
  const create = useCallback(async (
    userId: string,
    metadata?: Record<string, unknown>
  ): Promise<Session | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<Session>('session_create', {
        userId,
        metadata: metadata || {},
      });
      setSession(result);
      startSessionMonitoring(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create session';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Invalidate current session
  const invalidate = useCallback(async (): Promise<void> => {
    if (!session) return;
    
    try {
      await invoke('session_invalidate', { sessionId: session.id });
    } catch (err) {
      console.error('Failed to invalidate session:', err);
    } finally {
      stopSessionMonitoring();
      setSession(null);
    }
  }, [session]);
  
  // Refresh session stats
  const refreshStats = useCallback(async (): Promise<void> => {
    try {
      const result = await invoke<SessionStats>('session_stats');
      setStats(result);
    } catch (err) {
      console.error('Failed to get session stats:', err);
    }
  }, []);
  
  // Extend session expiration
  const extend = useCallback(async (additionalMs: number): Promise<void> => {
    if (!session) return;
    try {
      // Backend doesn't have extend yet, but we can re-validate which updates lastActivity
      await validate(session.id);
    } catch (err) {
      console.error('Failed to extend session:', err);
    }
  }, [session, validate]);
  
  // Start monitoring session expiration
  const startSessionMonitoring = useCallback((s: Session) => {
    stopSessionMonitoring();
    
    // Check periodically
    checkIntervalRef.current = setInterval(async () => {
      const validated = await validate(s.id);
      if (!validated) {
        // Session expired or invalid
        stopSessionMonitoring();
        setSession(null);
        setError('Session expired. Please sign in again.');
        return;
      }
      
      setSession(validated);
      
      // Check for expiry warning
      const timeUntilExpiry = validated.expiresAt - Date.now();
      if (timeUntilExpiry < SESSION_WARNING_THRESHOLD && timeUntilExpiry > 0) {
        if (!warningTimeoutRef.current) {
          warningTimeoutRef.current = window.setTimeout(() => {
            // Could emit a warning event here
            console.warn('Session expiring soon');
          }, timeUntilExpiry);
        }
      }
    }, SESSION_CHECK_INTERVAL);
    
    // Initial stats load
    refreshStats();
  }, [session, validate, refreshStats]);
  
  const stopSessionMonitoring = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = undefined;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = undefined;
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => stopSessionMonitoring();
  }, [stopSessionMonitoring]);
  
  // Check if session is valid (not expired)
  const isValid = session && session.expiresAt > Date.now();
  
  // Time until expiry in ms
  const timeUntilExpiry = session ? session.expiresAt - Date.now() : 0;
  
  return {
    session,
    stats,
    isLoading,
    error,
    isValid: !!isValid,
    timeUntilExpiry,
    create,
    invalidate,
    extend,
    refreshStats,
    validate: validate.bind(null, session?.id || ''),
  };
}

/**
 * Hook for managing multiple user sessions.
 */
export function useUserSessions(userId: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      // Backend would need a new command for this
      // For now, we can't fetch other sessions from frontend
    } catch (err) {
      console.error('Failed to fetch user sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);
  
  const invalidateAll = useCallback(async () => {
    // Backend would need a new command for this
  }, [userId]);
  
  return { sessions, isLoading, refresh, invalidateAll };
}
