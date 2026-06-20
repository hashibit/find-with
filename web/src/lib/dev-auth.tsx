'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// Mock auth context for development - bypasses Clerk SDK entirely
interface MockUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
}

interface MockAuth {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: MockUser | null;
  userId: string | null;
  sessionId: string | null;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  signIn: (email: string, password?: string) => Promise<void>;
  signUp: (email: string, password?: string, firstName?: string, lastName?: string) => Promise<void>;
}

const MockAuthContext = createContext<MockAuth>({
  isLoaded: true,
  isSignedIn: false,
  user: null,
  userId: null,
  sessionId: null,
  getToken: async () => null,
  signOut: async () => {},
  signIn: async () => {},
  signUp: async () => {},
});

const MOCK_API = 'http://localhost:14611';

// LocalStorage keys for persistence across reloads
const STORAGE_KEY_TOKEN = 'dev_auth_token';
const STORAGE_KEY_USER = 'dev_auth_user';
const STORAGE_KEY_SESSION = 'dev_auth_session';

function loadFromStorage(): { user: MockUser | null; token: string | null; sessionId: string | null } {
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const userJson = localStorage.getItem(STORAGE_KEY_USER);
    const sessionId = localStorage.getItem(STORAGE_KEY_SESSION);
    if (token && userJson) {
      return { token, user: JSON.parse(userJson), sessionId };
    }
  } catch {}
  return { user: null, token: null, sessionId: null };
}

function saveToStorage(user: MockUser | null, token: string | null, sessionId: string | null) {
  try {
    if (user && token) {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEY_SESSION, sessionId || '');
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_SESSION);
    }
  } catch {}
}

export function DevAuthProvider({ children }: { children: ReactNode }) {
  const stored = loadFromStorage();
  const [user, setUser] = useState<MockUser | null>(stored.user);
  const [sessionId, setSessionId] = useState<string | null>(stored.sessionId);
  const [token, setToken] = useState<string | null>(stored.token);

  const signIn = useCallback(async (email: string, password?: string) => {
    const resp = await fetch(`${MOCK_API}/v1/sign_ins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password: password || 'dev123' }),
    });
    const data = await resp.json();
    if (data.user && data.token) {
      const u: MockUser = {
        id: data.user.id,
        email: data.user.email_addresses?.[0]?.email_address || email,
        firstName: data.user.first_name,
        lastName: data.user.last_name,
        fullName: data.user.first_name && data.user.last_name
          ? `${data.user.first_name} ${data.user.last_name}`
          : null,
        imageUrl: data.user.image_url,
      };
      setUser(u);
      setSessionId(data.session?.id || data.created_session?.id);
      setToken(data.token);
      saveToStorage(u, data.token, data.session?.id || data.created_session?.id);
    }
  }, []);

  const signUp = useCallback(async (email: string, password?: string, firstName?: string, lastName?: string) => {
    const resp = await fetch(`${MOCK_API}/v1/sign_ups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_address: email, password: password || 'dev123', first_name: firstName, last_name: lastName }),
    });
    const data = await resp.json();
    if (data.user && data.token) {
      const u: MockUser = {
        id: data.user.id,
        email: data.user.email_addresses?.[0]?.email_address || email,
        firstName: data.user.first_name,
        lastName: data.user.last_name,
        fullName: data.user.first_name && data.user.last_name
          ? `${data.user.first_name} ${data.user.last_name}`
          : null,
        imageUrl: data.user.image_url,
      };
      setUser(u);
      setSessionId(data.session?.id || data.created_session?.id);
      setToken(data.token);
      saveToStorage(u, data.token, data.session?.id || data.created_session?.id);
    }
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (token) return token;
    if (user) {
      const resp = await fetch(`${MOCK_API}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub: user.id, email: user.email }),
      });
      const data = await resp.json();
      setToken(data.token);
      saveToStorage(user, data.token, sessionId);
      return data.token;
    }
    return null;
  }, [token, user, sessionId]);

  const signOut = useCallback(async () => {
    setUser(null);
    setSessionId(null);
    setToken(null);
    saveToStorage(null, null, null);
    window.location.href = '/';
  }, []);

  return (
    <MockAuthContext.Provider value={{
      isLoaded: true,
      isSignedIn: !!user,
      user,
      userId: user?.id,
      sessionId,
      getToken,
      signOut,
      signIn,
      signUp,
    }}>
      {children}
    </MockAuthContext.Provider>
  );
}

export function useDevAuth() {
  return useContext(MockAuthContext);
}

export function useDevUser() {
  const { user, isLoaded } = useDevAuth();
  return { user, isLoaded };
}

export function useDevSession() {
  const { sessionId, user, isLoaded } = useDevAuth();
  return {
    session: sessionId ? { id: sessionId, user } : null,
    isLoaded,
  };
}

export function useDevSignIn() {
  const { isLoaded, user, signIn } = useDevAuth();
  return {
    isLoaded,
    signIn: user ? { status: 'complete' } : null,
    attemptFirstFactor: signIn,
  };
}

export function useDevSignUp() {
  const { isLoaded, user, signUp } = useDevAuth();
  return {
    isLoaded,
    signUp: user ? { status: 'complete' } : null,
    create: signUp,
  };
}

export function DevSignedIn({ children }: { children: ReactNode }) {
  const { isSignedIn } = useDevAuth();
  return isSignedIn ? <>{children}</> : null;
}

export function DevSignedOut({ children }: { children: ReactNode }) {
  const { isSignedIn } = useDevAuth();
  return isSignedIn ? null : <>{children}</>;
}

export function DevUserButton() {
  const { user, signOut } = useDevAuth();
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

export function DevSignIn({ redirectUrl, signUpUrl }: { redirectUrl?: string; signUpUrl?: string }) {
  const { signIn } = useDevAuth();
  const router = useRouter();
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.email as HTMLInputElement).value;
    const password = (form.password as HTMLInputElement).value;
    await signIn(email, password);
    router.push(redirectUrl || '/dashboard');
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4 text-center">Sign in (Dev)</h1>
      <p className="text-sm text-gray-500 mb-4 text-center">Any credentials work</p>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input name="email" type="email" className="w-full px-3 py-2 border rounded-md" defaultValue="dev@findwith.local" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input name="password" type="password" className="w-full px-3 py-2 border rounded-md" defaultValue="dev123" />
        </div>
        <button type="submit" className="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
          Sign in
        </button>
        {signUpUrl && (
          <p className="mt-4 text-center text-sm text-gray-500">
            Don't have an account? <a href={signUpUrl} className="text-indigo-600 hover:underline">Sign up</a>
          </p>
        )}
      </form>
    </div>
  );
}

export function DevSignUp({ redirectUrl, signInUrl }: { redirectUrl?: string; signInUrl?: string }) {
  const { signUp } = useDevAuth();
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
        <button type="submit" className="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
          Create account
        </button>
        {signInUrl && (
          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account? <a href={signInUrl} className="text-indigo-600 hover:underline">Sign in</a>
          </p>
        )}
      </form>
    </div>
  );
}