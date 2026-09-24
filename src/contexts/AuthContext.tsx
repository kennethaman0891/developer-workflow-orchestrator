'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string; // URL or initial-based placeholder
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
}

interface AuthState {
  currentUser: User | null;
  collaborators: User[];
  isLoading: boolean;
  invitationCode: string | null;
}

interface AuthContextType extends AuthState {
  signInWithGoogle: (profile: { email: string; name: string; picture: string }) => void;
  signInManually: (name: string, email: string) => void;
  signOut: () => void;
  generateInviteCode: () => void;
  acceptInvite: (code: string, profile: { email: string; name: string; picture: string }) => boolean;
  removeCollaborator: (userId: string) => void;
  kickCollaborator: (userId: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Demo accounts for testing without Google OAuth
const DEMO_USERS = [
  { email: 'kenneth@demo.dev', name: 'Kenneth Aman', picture: '' },
  { email: 'sarah@demo.dev', name: 'Sarah Chen', picture: '' },
  { email: 'mike@demo.dev', name: 'Mike Johnson', picture: '' },
];

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function createInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    currentUser: null,
    collaborators: [],
    isLoading: false,
    invitationCode: null,
  });

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dwo_auth');
      if (saved) {
        const parsed = JSON.parse(saved) as { currentUser: User; collaborators: User[] };
        setState(prev => ({ ...prev, currentUser: parsed.currentUser, collaborators: parsed.collaborators }));
      }
    } catch {
      // ignore corrupt data
    }
  }, []);

  const persist = useCallback((s: AuthState) => {
    localStorage.setItem('dwo_auth', JSON.stringify({
      currentUser: s.currentUser,
      collaborators: s.collaborators,
    }));
  }, []);

  const signInWithGoogle = useCallback((profile: { email: string; name: string; picture: string }) => {
    const user: User = {
      id: generateId(),
      email: profile.email,
      name: profile.name,
      avatar: profile.picture || '',
      role: 'owner',
      joinedAt: new Date().toISOString(),
    };
    setState(prev => {
      const next = { ...prev, currentUser: user, collaborators: prev.collaborators.filter(c => c.email !== user.email) };
      persist(next);
      return next;
    });
  }, [persist]);

  const signInManually = useCallback((name: string, email: string) => {
    const existing = DEMO_USERS.find(u => u.email === email);
    const picture = existing?.picture || '';
    signInWithGoogle({ email, name: name || existing?.name || email.split('@')[0], picture });
  }, [signInWithGoogle]);

  const signOut = useCallback(() => {
    setState(prev => {
      const next = { ...prev, currentUser: null };
      persist(next);
      return next;
    });
  }, [persist]);

  const generateInviteCode = useCallback(() => {
    setState(prev => {
      const code = createInviteCode();
      return { ...prev, invitationCode: code };
    });
  }, []);

  const acceptInvite = useCallback((code: string, profile: { email: string; name: string; picture: string }) => {
    let storedCode: string | null = null;
    try {
      storedCode = localStorage.getItem('dwo_invite_code');
    } catch {}

    if (storedCode !== code.toUpperCase()) return false;

    const user: User = {
      id: generateId(),
      email: profile.email,
      name: profile.name,
      avatar: profile.picture || '',
      role: 'editor',
      joinedAt: new Date().toISOString(),
    };

    setState(prev => {
      if (prev.collaborators.find(c => c.email === user.email)) return prev;
      const next = { ...prev, collaborators: [...prev.collaborators, user] };
      persist(next);
      return next;
    });
    return true;
  }, [persist]);

  const removeCollaborator = useCallback((userId: string) => {
    setState(prev => {
      const next = { ...prev, collaborators: prev.collaborators.filter(c => c.id !== userId) };
      persist(next);
      return next;
    });
  }, [persist]);

  const kickCollaborator = useCallback((userId: string) => {
    setState(prev => {
      const next = { ...prev, collaborators: prev.collaborators.filter(c => c.id !== userId) };
      persist(next);
      return next;
    });
  }, [persist]);

  return (
    <AuthContext.Provider value={{ ...state, signInWithGoogle, signInManually, signOut, generateInviteCode, acceptInvite, removeCollaborator, kickCollaborator }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
