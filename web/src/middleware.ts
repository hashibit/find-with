import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Custom middleware to proxy Clerk FAPI requests to mock-clerk server
const CLERK_MOCK_URL = process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL || 'http://localhost:14611';
const CLERK_CDN_URL = 'https://npm.clerk.dev';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log('[MIDDLEWARE]', request.method, pathname);

  // Proxy ClerkJS loading requests to Clerk CDN
  if (pathname.startsWith('/__clerk/npm/')) {
    return proxyClerkCdn(pathname, request);
  }

  // Proxy /__clerk/* API requests to mock-clerk
  if (pathname.startsWith('/__clerk/v1/') || pathname.startsWith('/__clerk/.well-known/') || pathname === '/__clerk/sign') {
    return proxyMockClerk(pathname, request);
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

async function proxyClerkCdn(pathname: string, request: NextRequest) {
  const cdnPath = pathname.replace('/__clerk/npm/', '');
  const targetUrl = new URL(cdnPath, CLERK_CDN_URL);

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: { 'Accept': '*/*' },
  });

  if (!response.ok) {
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

async function proxyMockClerk(pathname: string, request: NextRequest) {
  const targetPath = pathname.replace('/__clerk', '');
  const targetUrl = new URL(targetPath + request.nextUrl.search, CLERK_MOCK_URL);

  const headers = new Headers();
  const ct = request.headers.get('Content-Type');
  if (ct) headers.set('Content-Type', ct);
  const clientHeader = request.headers.get('__client');
  if (clientHeader) headers.set('__client', clientHeader);
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers.set('Authorization', authHeader);
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) headers.set('Cookie', cookieHeader);

  let body: string | undefined;
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
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
  console.log('[MIDDLEWARE] mock-clerk proxy:', response.status, responseBody.slice(0, 100));

  return new NextResponse(responseBody, {
    status: response.status,
    headers: responseHeaders,
  });
}

// Minimal ClerkJS stub for development
function getClerkJSStub(): string {
  return `
(function() {
  const MOCK_API = 'http://localhost:14611';
  window.Clerk = {
    isLoaded: true, session: null, user: null,
    async load() {
      try {
        const resp = await fetch(MOCK_API + '/v1/client');
        const data = await resp.json();
        if (data.response?.sessions?.[0]) {
          this.session = data.response.sessions[0];
          this.user = data.response.sessions[0].user;
        }
      } catch (e) {}
    },
    async signOut() { this.session = null; this.user = null; window.location.href = '/'; },
    openSignIn() { window.location.href = '/login'; },
    openSignUp() { window.location.href = '/signup'; }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.Clerk.load());
  } else {
    window.Clerk.load();
  }
})();
`;
}
