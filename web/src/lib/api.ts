const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:14607';

export async function apiClient(path: string, options: RequestInit = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}
