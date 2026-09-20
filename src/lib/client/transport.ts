/**
 * The single seam between the practitioner frontend and the backend.
 *
 * Everything in `src/lib/client` goes through `apiFetch`, which has the exact
 * signature of `fetch`. Since integration it points at the real API routes by
 * default. The in-browser mock is opt-in (NEXT_PUBLIC_USE_MOCK_API=true) for
 * developing without a database; the frontend test suite switches it on per
 * file. A mock that is on by default is one forgotten env var away from
 * writing October's data into a localStorage stub, so the default is real.
 *
 * Because the mock hands back genuine `Response` objects, the parsing, error
 * mapping and 409/401/422 branches in `http.ts` are the *same* code path in
 * both modes — nothing downstream of here knows which one is live.
 *
 * OWNER: Stream 2 (practitioner frontend).
 */
import { mockFetch } from './mock/server'

/** ← THE one-line swap. Real API by default; mock only when explicitly asked. */
export const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true'

export function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (USE_MOCK_API) return mockFetch(path, init)
  // Real transport. `credentials: 'include'` so the hsa_session cookie rides
  // along; the Authorization header set in http.ts is the belt to that braces
  // and is what makes a reminder-link login work in a cookie-blocking browser.
  return fetch(path, { credentials: 'include', ...init })
}
