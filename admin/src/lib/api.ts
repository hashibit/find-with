const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

const COOKIE_NAME = 'admin_secret'

export function getAdminSecret(): string {
  if (typeof window === 'undefined') return ''
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

export function setAdminSecret(secret: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(secret)}; path=/; SameSite=Strict`
}

export function clearAdminSecret(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  secret?: string,
): Promise<Response> {
  const adminSecret = secret ?? getAdminSecret()
  const url = `${BASE_URL}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': adminSecret,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new ApiError(response.status, text)
  }

  return response
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  secret?: string,
): Promise<T> {
  let url = path
  if (params) {
    const filtered = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== '',
    ) as [string, string | number][]
    if (filtered.length > 0) {
      const qs = new URLSearchParams(
        filtered.map(([k, v]) => [k, String(v)]),
      ).toString()
      url = `${path}?${qs}`
    }
  }
  const res = await apiFetch(url, { method: 'GET' }, secret)
  return res.json()
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  secret?: string,
): Promise<T> {
  const res = await apiFetch(
    path,
    {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    secret,
  )
  return res.json()
}
