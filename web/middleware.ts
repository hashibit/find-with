import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Custom middleware to proxy Clerk FAPI requests to mock-clerk server
const CLERK_MOCK_URL = process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL || 'http://localhost:14611';
const CLERK_CDN_URL = 'https://npm.clerk.dev';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Proxy ClerkJS loading requests to Clerk CDN
  // Clerk SDK hotloads from /__clerk/npm/@clerk/clerk-js@version/dist/clerk.browser.js
  if (pathname.startsWith('/__clerk/npm/')) {
    const cdnPath = pathname.replace('/__clerk/npm/', '');
    const targetUrl = new URL(cdnPath, CLERK_CDN_URL);

    console.log('[CLERK PROXY] Loading ClerkJS from CDN:', targetUrl.href);

    const response = await fetch(targetUrl, {
      method: request.method,
      headers: { 'Accept': '*/*' },
    });

    if (!response.ok) {
      console.error('[CLERK PROXY] CDN fetch failed:', response.status);
      // Return a minimal ClerkJS stub that uses our mock API
      return new NextResponse(getClerkJSStub(), {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  }

  // Proxy /__clerk/* API requests to mock-clerk
  if (pathname.startsWith('/__clerk/v1/') || pathname.startsWith('/__clerk/.well-known/')) {
    const targetPath = pathname.replace('/__clerk', '');
    const targetUrl = new URL(targetPath + request.nextUrl.search, CLERK_MOCK_URL);

    console.log('[CLERK PROXY] API request to mock:', targetUrl.href);

    const headers = new Headers();
    headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
    if (request.headers.get('__client')) headers.set('__client', request.headers.get('__client')!);
    if (request.headers.get('Authorization')) headers.set('Authorization', request.headers.get('Authorization')!);

    let body: string | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text();
    }

    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: body,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, __client');

    const responseBody = await response.text();
    console.log('[CLERK PROXY] Response:', response.status, responseBody.slice(0, 200));

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  }

  // Handle OPTIONS for CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, __client',
      },
    });
  }

  return NextResponse.next();
}

// Minimal ClerkJS stub for development - uses mock API directly
function getClerkJSStub(): string {
  return `
// Minimal ClerkJS stub for dev - bypasses SDK and uses mock API directly
(function() {
  const MOCK_API = 'http://localhost:14611';

  window.Clerk = {
    isLoaded: true,
    session: null,
    user: null,

    async load() {
      console.log('[MOCK CLERK] Loading from', MOCK_API);
      try {
        const resp = await fetch(MOCK_API + '/v1/client');
        const data = await resp.json();
        if (data.response && data.response.sessions && data.response.sessions[0]) {
          this.session = data.response.sessions[0];
          this.user = data.response.sessions[0].user;
        }
        console.log('[MOCK CLERK] Loaded user:', this.user?.email_addresses?.[0]?.email_address);
      } catch (e) {
        console.error('[MOCK CLERK] Load failed:', e);
      }
    },

    async signOut() {
      this.session = null;
      this.user = null;
      window.location.href = '/';
    },

    openSignIn() {
      window.location.href = '/login';
    },

    openSignUp() {
      window.location.href = '/signup';
    }
  };

  // Auto-load on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.Clerk.load());
  } else {
    window.Clerk.load();
  }
})();
`;
}

export const config = {
  matcher: [
    // Clerk proxy paths
    '/__clerk/(.*)',
  ],
};