'use client';

import { ReactNode, useEffect, useState, useContext, createContext } from 'react';
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useUser as useClerkUser,
  useSession as useClerkSession,
  useSignIn as useClerkSignIn,
  useSignUp as useClerkSignUp,
  SignedIn as ClerkSignedIn,
  SignedOut as ClerkSignedOut,
  UserButton as ClerkUserButton,
  SignIn as ClerkSignIn,
  SignUp as ClerkSignUp,
} from '@clerk/nextjs';
import {
  DevAuthProvider,
  useDevAuth,
  DevSignedIn,
  DevSignedOut,
  DevUserButton,
  DevSignIn,
  DevSignUp,
} from './dev-auth';

// Unified auth interface - both Clerk and Dev providers must satisfy this
interface AuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isLoaded: false,
  isSignedIn: false,
  userId: null,
  getToken: async () => null,
  signOut: async () => {},
});

const AuthModeContext = createContext<'mock' | 'clerk' | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:14607';
const AUTH_CONFIG_ENDPOINT = `${API_BASE}/api/v1/config/auth`;

// Bridge component: reads Clerk hooks and populates AuthContext
function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useClerkAuth();
  return (
    <AuthContext.Provider value={{ isLoaded, isSignedIn, userId, getToken, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// AuthProvider fetches config from backend, then wraps with correct provider
export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<{ authMode: 'mock' | 'clerk' } | null>(null);

  useEffect(() => {
    fetch(AUTH_CONFIG_ENDPOINT)
      .then((res) => {
        if (!res.ok) throw new Error(`Config endpoint returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.authMode === 'mock' || data.authMode === 'clerk') {
          setConfig(data);
        } else {
          throw new Error('Invalid authMode in config');
        }
      })
      .catch((e) => {
        console.error('[AuthProvider] Failed to fetch auth config:', e);
        setConfig({ authMode: 'clerk' }); // Fallback to clerk
      });
  }, []);

  if (!config) return null;

  if (config.authMode === 'mock') {
    return (
      <AuthModeContext.Provider value="mock">
        <DevAuthProvider>
          <DevAuthBridge>{children}</DevAuthBridge>
        </DevAuthProvider>
      </AuthModeContext.Provider>
    );
  }

  return (
    <AuthModeContext.Provider value="clerk">
      <ClerkProvider>
        <ClerkAuthBridge>{children}</ClerkAuthBridge>
      </ClerkProvider>
    </AuthModeContext.Provider>
  );
}

// Bridge for Dev: reads DevAuth context and populates unified AuthContext
function DevAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useDevAuth();
  return (
    <AuthContext.Provider value={{ isLoaded, isSignedIn, userId, getToken, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// Unified hook - reads from AuthContext (no conditional hook calls)
export function useAuth() {
  return useContext(AuthContext);
}

// Mode-specific components - still need authMode check (not hooks, just JSX)
export function SignedIn({ children }: { children: ReactNode }) {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return <DevSignedIn>{children}</DevSignedIn>;
  return <ClerkSignedIn>{children}</ClerkSignedIn>;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return <DevSignedOut>{children}</DevSignedOut>;
  return <ClerkSignedOut>{children}</ClerkSignedOut>;
}

export function UserButton() {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return <DevUserButton />;
  return <ClerkUserButton />;
}

export function SignIn(props: { redirectUrl?: string; signUpUrl?: string; appearance?: any }) {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return <DevSignIn {...props} />;
  return <ClerkSignIn {...props} />;
}

export function SignUp(props: { redirectUrl?: string; signInUrl?: string; appearance?: any }) {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return <DevSignUp {...props} />;
  return <ClerkSignUp {...props} />;
}

// Re-export Clerk's specific hooks for advanced use cases
export { useClerkUser, useClerkSession, useClerkSignIn, useClerkSignUp };
export { useDevUser, useDevSession, useDevSignIn, useDevSignUp } from './dev-auth';