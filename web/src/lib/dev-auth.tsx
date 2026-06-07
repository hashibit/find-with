'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

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
}

const MockAuthContext = createContext<MockAuth>({
  isLoaded: false,
  isSignedIn: false,
  user: null,
  userId: null,
  sessionId: null,
  getToken: async () => null,
  signOut: async () => {},
});

const MOCK_API = 'http://localhost:14611'; // mock-clerk host port (not container port 14803)

export function DevAuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<MockUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    loadMockAuth();
  }, []);

  async function loadMockAuth() {
    try {
      const resp = await fetch(`${MOCK_API}/v1/client`);
      const data = await resp.json();

      if (data.response?.sessions?.[0]) {
        const session = data.response.sessions[0];
        const sessionUser = session.user;

        setSessionId(session.id);
        setUser({
          id: sessionUser.id,
          email: sessionUser.email_addresses?.[0]?.email_address || 'dev@findwith.local',
          firstName: sessionUser.first_name,
          lastName: sessionUser.last_name,
          fullName: sessionUser.first_name && sessionUser.last_name
            ? `${sessionUser.first_name} ${sessionUser.last_name}`
            : null,
          imageUrl: sessionUser.image_url,
        });

        // Get a signed JWT from mock-clerk
        const signResp = await fetch(`${MOCK_API}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sub: sessionUser.id, email: sessionUser.email_addresses?.[0]?.email_address }),
        });
        const signData = await signResp.json();
        setToken(signData.token);
      }
    } catch (e) {
      console.error('[DEV AUTH] Load failed:', e);
    } finally {
      setIsLoaded(true);
    }
  }

  async function getToken(): Promise<string | null> {
    if (token) return token;

    // Refresh token
    if (user) {
      const signResp = await fetch(`${MOCK_API}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub: user.id, email: user.email }),
      });
      const signData = await signResp.json();
      setToken(signData.token);
      return signData.token;
    }
    return null;
  }

  async function signOut() {
    setUser(null);
    setSessionId(null);
    setToken(null);
    window.location.href = '/';
  }

  return (
    <MockAuthContext.Provider value={{
      isLoaded,
      isSignedIn: !!user,
      user,
      userId: user?.id,
      sessionId,
      getToken,
      signOut,
    }}>
      {children}
    </MockAuthContext.Provider>
  );
}

export function useDevAuth() {
  return useContext(MockAuthContext);
}

// Hook aliases matching Clerk's API
export function useAuth() {
  return useDevAuth();
}

export function useUser() {
  const { user } = useDevAuth();
  return { user, isLoaded: true };
}

export function useSession() {
  const { sessionId, user, isLoaded } = useDevAuth();
  return {
    session: sessionId ? { id: sessionId, user } : null,
    isLoaded
  };
}

export function useSignIn() {
  const { isLoaded, user } = useDevAuth();

  return {
    isLoaded,
    signIn: user ? { status: 'complete' } : null,
    // Mock sign-in function
    attemptFirstFactor: async ({ password }: { password: string }) => {
      // Always succeeds in dev
      window.location.reload();
    },
  };
}

export function useSignUp() {
  const { isLoaded, user } = useDevAuth();

  return {
    isLoaded,
    signUp: user ? { status: 'complete' } : null,
    // Mock sign-up function
    create: async ({ email, password, firstName, lastName }: any) => {
      // Always succeeds in dev
      window.location.reload();
    },
  };
}

export function SignedIn({ children }: { children: ReactNode }) {
  const { isSignedIn } = useDevAuth();
  return isSignedIn ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { isSignedIn } = useDevAuth();
  return isSignedIn ? null : <>{children}</>;
}

export function UserButton() {
  const { user, signOut } = useDevAuth();

  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full" />
      <span className="text-sm">{user.fullName || user.email}</span>
      <button
        onClick={signOut}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        Sign out
      </button>
    </div>
  );
}

// Mock SignIn component
export function SignIn({ redirectUrl, signUpUrl }: { redirectUrl?: string; signUpUrl?: string; appearance?: any }) {
  const { isSignedIn, user } = useDevAuth();

  if (isSignedIn) {
    window.location.href = redirectUrl || '/dashboard';
    return null;
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4 text-center">Sign in (Dev Mode)</h1>
      <p className="text-sm text-gray-500 mb-4 text-center">
        Using mock authentication. Any credentials will work.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); window.location.reload(); }}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            className="w-full px-3 py-2 border rounded-md"
            defaultValue="dev@findwith.local"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
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
      </form>
      {signUpUrl && (
        <p className="text-sm text-center mt-4">
          Don't have an account?{' '}
          <a href={signUpUrl} className="text-indigo-600 hover:underline">
            Sign up
          </a>
        </p>
      )}
    </div>
  );
}

// Mock SignUp component
export function SignUp({ redirectUrl, signInUrl }: { redirectUrl?: string; signInUrl?: string; appearance?: any }) {
  const { isSignedIn } = useDevAuth();

  if (isSignedIn) {
    window.location.href = redirectUrl || '/dashboard';
    return null;
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4 text-center">Sign up (Dev Mode)</h1>
      <p className="text-sm text-gray-500 mb-4 text-center">
        Using mock authentication. Account will be auto-created.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); window.location.reload(); }}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">First name</label>
          <input type="text" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Last name</label>
          <input type="text" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input type="email" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input type="password" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <button
          type="submit"
          className="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Create account
        </button>
      </form>
      {signInUrl && (
        <p className="text-sm text-center mt-4">
          Already have an account?{' '}
          <a href={signInUrl} className="text-indigo-600 hover:underline">
            Sign in
          </a>
        </p>
      )}
    </div>
  );
}