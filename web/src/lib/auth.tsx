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
  useDevUser,
  useDevSession,
  useDevSignIn,
  useDevSignUp,
  DevSignedIn,
  DevSignedOut,
  DevUserButton,
  DevSignIn,
  DevSignUp,
} from './dev-auth';

interface AuthConfig {
  authMode: 'mock' | 'clerk';
  jwksUrl: string;
}

const AuthModeContext = createContext<'mock' | 'clerk' | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:14607';

// AuthProvider fetches config from backend on mount
export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/config/auth`)
      .then((res) => {
        if (!res.ok) throw new Error(`Config endpoint returned ${res.status}`);
        return res.json();
      })
      .then((data: AuthConfig) => {
        if (data.authMode === 'mock' || data.authMode === 'clerk') {
          setConfig(data);
        } else {
          throw new Error('Invalid authMode in config');
        }
      })
      .catch((e) => {
        console.error('[AuthProvider] Failed to fetch auth config:', e);
        // Fallback to mock in dev (backend may not have /config/auth endpoint)
        setConfig({ authMode: 'mock', jwksUrl: 'http://localhost:14611/.well-known/jwks.json' });
      });
  }, []);

  if (!config) return null;

  if (config.authMode === 'mock') {
    return (
      <AuthModeContext.Provider value="mock">
        <DevAuthProvider>{children}</DevAuthProvider>
      </AuthModeContext.Provider>
    );
  }

  return (
    <AuthModeContext.Provider value="clerk">
      <ClerkProvider>{children}</ClerkProvider>
    </AuthModeContext.Provider>
  );
}

// Wrapper hooks - read authMode from context, call correct hook
export function useAuth() {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return useDevAuth();
  return useClerkAuth();
}

export function useUser() {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return useDevUser();
  return useClerkUser();
}

export function useSession() {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return useDevSession();
  return useClerkSession();
}

export function useSignIn() {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return useDevSignIn();
  return useClerkSignIn();
}

export function useSignUp() {
  const authMode = useContext(AuthModeContext);
  if (authMode === 'mock') return useDevSignUp();
  return useClerkSignUp();
}

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