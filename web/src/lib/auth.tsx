'use client';

import { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { DevAuthProvider } from './dev-auth';

const isDev = process.env.NODE_ENV === 'development';

// In development, use mock auth; in production, use real Clerk
export function AuthProvider({ children }: { children: ReactNode }) {
  if (isDev) {
    return <DevAuthProvider>{children}</DevAuthProvider>;
  }

  return (
    <ClerkProvider>
      {children}
    </ClerkProvider>
  );
}

// Export hooks that work in both environments
export { useAuth, useUser, useSession, useSignIn, useSignUp, SignedIn, SignedOut, UserButton, SignIn, SignUp } from './dev-auth';