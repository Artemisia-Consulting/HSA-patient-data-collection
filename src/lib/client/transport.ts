/**
 * The single seam between the practitioner frontend and the backend.
 *
 * Everything in `src/lib/client` goes through `apiFetch`, which has the exact
 * signature of `fetch`. While Agent 1's routes do not exist, it is pointed at
 * an in-browser mock that returns the same status codes, headers and JSON
 * bodies the real routes will. Swapping to the real API at integration is the
 * one line marked below (or setting NEXT_PUBLIC_USE_MOCK_API=false).
 *
 * Because the mock hands back genuine `Response` objects, the parsing, error
 * mapping and 409/401/422 branches in `http.ts` are the *same* code path in
 * both modes — nothing downstream of here knows which one is live.
 *
 * OWNER: Stream 2 (practitioner frontend).
 */
import { mockFetch } from './mock/server'

/** ← THE one-line swap. Set to `false` (or NEXT_PUBLIC_USE_MOCK_API=false). */
export const USE_MOCK_API =
  (process.env.NEXT_PUBLIC_USE_MOCK_API ?? 'true') !== 'false'

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
