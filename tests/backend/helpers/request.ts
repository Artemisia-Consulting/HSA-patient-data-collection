import { SESSION_COOKIE_NAME } from '@/lib/contract'

const BASE = 'http://localhost:3000'

export interface RequestOptions {
  method?: string
  body?: unknown
  token?: string
  cookieToken?: string
  headers?: Record<string, string>
  ip?: string
}

/** Build a Request exactly as a route handler receives it. */
export function apiRequest(pathAndQuery: string, options: RequestOptions = {}): Request {
  const headers = new Headers(options.headers)
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (options.token) headers.set('authorization', `Bearer ${options.token}`)
  if (options.cookieToken) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${options.cookieToken}`)
  }
  // Rate limits are keyed on the caller's IP; giving each test its own keeps
  // one test's traffic from tripping the limiter in another.
  headers.set('x-forwarded-for', options.ip ?? `10.0.0.${Math.floor(Math.random() * 250) + 1}`)

  return new Request(new URL(pathAndQuery, BASE), {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
}

export async function readJson<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** The value of the hsa_session cookie a response sets, if any. */
export function sessionCookieValue(response: Response): string | null {
  const header = response.headers.get('set-cookie')
  if (!header) return null
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]*)`).exec(header)
  return match ? match[1] : null
}

export const dateParams = (date: string) => ({ params: Promise.resolve({ date }) })
