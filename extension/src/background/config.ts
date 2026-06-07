/**
 * Runtime API base URL.
 * Set VITE_API_BASE in .env.production for prod builds.
 * Falls back to localhost for dev (vite build --watch).
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:14607';

/**
 * API_BASE already ends without a trailing slash.
 * Use API_BASE + '/api/v1' for v1 endpoints.
 */
export const API_V1 = `${API_BASE}/api/v1`;

/**
 * Mock Clerk URL for dev mode authentication.
 * Set VITE_MOCK_CLERK_URL in .env if mock runs elsewhere.
 */
export const MOCK_CLERK_URL = (import.meta.env.VITE_MOCK_CLERK_URL as string | undefined) ?? 'http://localhost:14611';
