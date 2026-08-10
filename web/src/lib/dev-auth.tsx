'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Mock auth context for development — uses httpOnly cookies via middleware proxy.
// Same model as production Clerk: session persistence via httpOnly cookie,
// short-lived JWT returned by getToken() for API calls.

interface LocalUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
}

interface LocalAuth {
  isMock: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  user: LocalUser | null;
  userId: string | null;
  sessionId: string | null;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  signIn: (email: string, password?: string) => Promise<void>;
  signUp: (
    email: string,
    password?: string,
    firstName?: string,
    lastName?: string,
  ) => Promise<void>;
}

export const LocalAuthContext = createContext<LocalAuth>({
  isMock: false,
  isLoaded: false,
  isSignedIn: false,
  user: null,
  userId: null,
  sessionId: null,
  getToken: async () => null,
  signOut: async () => {},
  signIn: async () => {},
  signUp: async () => {},
});

// Through middleware proxy so cookies are same-origin
const MOCK_API = '/__clerk/v1';

function userFromPayload(data: any): LocalUser {
  const u = data.user || data;
  return {
    id: u.id,
    email: u.email_addresses?.[0]?.email_address || u.email || '',
    firstName: u.first_name || null,
    lastName: u.last_name || null,
    fullName: u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : null,
    imageUrl: u.image_url || '',
  };
}

export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // On mount: restore session from httpOnly cookie via /v1/client
  useEffect(() => {
    fetch(`${MOCK_API}/client`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.session && data.user) {
          setUser(userFromPayload(data.user));
          setSessionId(data.session.id);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  const signIn = useCallback(async (email: string, password?: string) => {
    const resp = await fetch(`${MOCK_API}/sign_ins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier: email, password: password || 'dev123' }),
    });
    const data = await resp.json();
    if (data.user && data.token) {
      setUser(userFromPayload(data));
      setSessionId(data.session?.id || data.created_session?.id || null);
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password?: string, firstName?: string, lastName?: string) => {
      const resp = await fetch(`${MOCK_API}/sign_ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email_address: email,
          password: password || 'dev123',
          first_name: firstName,
          last_name: lastName,
        }),
      });
      const data = await resp.json();
      if (data.user && data.token) {
        setUser(userFromPayload(data));
        setSessionId(data.session?.id || data.created_session?.id || null);
      }
    },
    [],
  );

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    const resp = await fetch(`/__clerk/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const data = await resp.json();
    return data.token || null;
  }, [user]);

  const signOut = useCallback(async () => {
    if (sessionId) {
      // Delete session on server (also clears cookie via Set-Cookie)
      await fetch(`${MOCK_API}/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => {});
    }
    setUser(null);
    setSessionId(null);
    window.location.href = '/';
  }, [sessionId]);

  return (
    <LocalAuthContext.Provider
      value={{
        isMock: true,
        isLoaded,
        isSignedIn: !!user,
        user,
        userId: user?.id ?? null,
        sessionId,
        getToken,
        signOut,
        signIn,
        signUp,
      }}
    >
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalUser() {
  const { user, isLoaded } = useContext(LocalAuthContext);
  return { user, isLoaded };
}

export function useLocalSession() {
  const { sessionId, user, isLoaded } = useContext(LocalAuthContext);
  return {
    session: sessionId ? { id: sessionId, user } : null,
    isLoaded,
  };
}

export function useLocalSignIn() {
  const { isLoaded, user, signIn } = useContext(LocalAuthContext);
  return {
    isLoaded,
    signIn: user ? { status: 'complete' } : null,
    attemptFirstFactor: signIn,
  };
}

export function useLocalSignUp() {
  const { isLoaded, user, signUp } = useContext(LocalAuthContext);
  return {
    isLoaded,
    signUp: user ? { status: 'complete' } : null,
    create: signUp,
  };
}

export function LocalSignedIn({ children }: { children: ReactNode }) {
  const { isSignedIn } = useContext(LocalAuthContext);
  return isSignedIn ? <>{children}</> : null;
}

export function LocalSignedOut({ children }: { children: ReactNode }) {
  const { isSignedIn } = useContext(LocalAuthContext);
  return isSignedIn ? null : <>{children}</>;
}

export function LocalUserButton() {
  const { user, signOut } = useContext(LocalAuthContext);
  if (!user) return null;
  return (
    <div className="flex items-center gap-2">
      <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full" />
      <span className="text-sm">{user.fullName || user.email}</span>
      <button onClick={signOut} className="text-xs text-gray-500 hover:text-gray-700">
        Sign out
      </button>
    </div>
  );
}

export function LocalSignIn({
  redirectUrl,
  signUpUrl,
}: {
  redirectUrl?: string;
  signUpUrl?: string;
}) {
  const { signIn, isLoaded, isSignedIn } = useContext(LocalAuthContext);
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn && redirectUrl) {
      router.push(redirectUrl);
    }
  }, [isLoaded, isSignedIn, redirectUrl, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.email as HTMLInputElement).value;
    const password = (form.password as HTMLInputElement).value;
    await signIn(email, password);
    router.push(redirectUrl || '/dashboard');
  };

  if (!isLoaded) return null;

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4 text-center">Sign in (Dev)</h1>
      <p className="text-sm text-gray-500 mb-4 text-center">Any credentials work</p>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            name="email"
            type="email"
            className="w-full px-3 py-2 border rounded-md"
            defaultValue="dev@findwith.local"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            name="password"
            type="password"
            className="w-full px-3 py-2 border rounded-md"
            defaultValue="dev123"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Sign in
        </button>
        {signUpUrl && (
          <p className="mt-4 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <a href={signUpUrl} className="text-indigo-600 hover:underline">
              Sign up
            </a>
          </p>
        )}
      </form>
    </div>
  );
}

export function LocalSignUp({
  redirectUrl,
  signInUrl,
}: {
  redirectUrl?: string;
  signInUrl?: string;
}) {
  const { signUp } = useContext(LocalAuthContext);
  const router = useRouter();
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const firstName = (form.firstName as HTMLInputElement).value;
    const lastName = (form.lastName as HTMLInputElement).value;
    const email = (form.email as HTMLInputElement).value;
    const password = (form.password as HTMLInputElement).value;
    await signUp(email, password, firstName, lastName);
    router.push(redirectUrl || '/dashboard');
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4 text-center">Sign up (Dev)</h1>
      <p className="text-sm text-gray-500 mb-4 text-center">Account auto-created</p>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">First name</label>
          <input name="firstName" type="text" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Last name</label>
          <input name="lastName" type="text" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input name="email" type="email" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input name="password" type="password" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <button
          type="submit"
          className="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Create account
        </button>
        {signInUrl && (
          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <a href={signInUrl} className="text-indigo-600 hover:underline">
              Sign in
            </a>
          </p>
        )}
      </form>
    </div>
  );
}
