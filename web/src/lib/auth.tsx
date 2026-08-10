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
  LocalAuthProvider,
  LocalSignedIn,
  LocalSignedOut,
  LocalUserButton,
  LocalSignIn,
  LocalSignUp,
  LocalAuthContext,
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

interface UserContextValue {
  user: {
    id?: string;
    email?: string;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    imageUrl?: string;
  } | null;
  isLoaded: boolean;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  isLoaded: false,
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:14607';
const AUTH_CONFIG_ENDPOINT = `${API_BASE}/api/v1/config/auth`;

// Bridge component: reads Clerk hooks and populates AuthContext + UserContext
function ClerkAuthWrapper({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useClerkAuth();
  const { user, isLoaded: userLoaded } = useClerkUser();
  return (
    <AuthContext.Provider
      value={{
        isLoaded: isLoaded ?? false,
        isSignedIn: isSignedIn ?? false,
        userId: userId ?? null,
        getToken,
        signOut,
      }}
    >
      <UserContext.Provider
        value={{
          user: user
            ? {
                id: user.id,
                email: user.emailAddresses?.[0]?.emailAddress,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                imageUrl: user.imageUrl,
              }
            : null,
          isLoaded: userLoaded,
        }}
      >
        {children}
      </UserContext.Provider>
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
      <LocalAuthProvider>
        <LocalAuthWrapper>{children}</LocalAuthWrapper>
      </LocalAuthProvider>
    );
  }

  return (
    <ClerkProvider>
      <ClerkAuthWrapper>{children}</ClerkAuthWrapper>
    </ClerkProvider>
  );
}

// Bridge for Dev: reads DevAuth context and populates unified AuthContext + UserContext
function LocalAuthWrapper({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut, user } = useContext(LocalAuthContext);
  return (
    <AuthContext.Provider value={{ isLoaded, isSignedIn, userId, getToken, signOut }}>
      <UserContext.Provider
        value={{
          user: user
            ? {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                imageUrl: user.imageUrl,
              }
            : null,
          isLoaded,
        }}
      >
        {children}
      </UserContext.Provider>
    </AuthContext.Provider>
  );
}

// Unified hook - reads from AuthContext (no conditional hook calls)
export function useAuth() {
  return useContext(AuthContext);
}

// Unified user hook - reads from UserContext (no conditional hook calls)
export function useUser() {
  return useContext(UserContext);
}

// Mode-specific components - still need authMode check (not hooks, just JSX)
export function SignedIn({ children }: { children: ReactNode }) {
  const authCtx = useContext(LocalAuthContext);
  if (authCtx.isMock === true) return <LocalSignedIn>{children}</LocalSignedIn>;
  return <ClerkSignedIn>{children}</ClerkSignedIn>;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const authCtx = useContext(LocalAuthContext);
  if (authCtx.isMock === true) return <LocalSignedOut>{children}</LocalSignedOut>;
  return <ClerkSignedOut>{children}</ClerkSignedOut>;
}

export function UserButton() {
  const authCtx = useContext(LocalAuthContext);
  if (authCtx.isMock === true) return <LocalUserButton />;
  return <ClerkUserButton />;
}

export function SignIn(props: { redirectUrl?: string; signUpUrl?: string; appearance?: any }) {
  const authCtx = useContext(LocalAuthContext);
  if (authCtx.isMock === true) return <LocalSignIn {...props} />;
  return <ClerkSignIn {...props} />;
}

export function SignUp(props: { redirectUrl?: string; signInUrl?: string; appearance?: any }) {
  const authCtx = useContext(LocalAuthContext);
  if (authCtx.isMock === true) return <LocalSignUp {...props} />;
  return <ClerkSignUp {...props} />;
}

// Re-export Clerk's specific hooks for advanced use cases
export { useClerkUser, useClerkSession, useClerkSignIn, useClerkSignUp };
export { useLocalUser, useLocalSession, useLocalSignIn, useLocalSignUp } from './dev-auth';
