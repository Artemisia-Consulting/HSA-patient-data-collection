/**
 * The frontend's whole view of the backend: each call is a thin wrapper over
 * `request()` with the contract's own response schema. Nothing in `src/app` or
 * `src/components` calls `fetch` directly.
 *
 * OWNER: Stream 2.
 */
import {
  type AuthSessionResponse,
  type DailyLog,
  type DailyLogRequest,
  type DashboardEntriesResponse,
  type DashboardSummary,
  type MeResponse,
  type SignupRequest,
  type TaxonomyResponse,
  authSessionResponseSchema,
  dailyLogListResponseSchema,
  dailyLogSchema,
  dashboardEntriesResponseSchema,
  dashboardSummarySchema,
  meResponseSchema,
  taxonomyResponseSchema,
} from '../contract/api'
import { z } from 'zod'

import { request } from './http'
import { clearSession, setReminderLinkId, setSessionToken } from './session'

/** POST /api/auth/researcher → 200 | 400 | 403 | 429 — the dev-only code path. */
export async function signInAsResearcher(code: string): Promise<AuthSessionResponse> {
  const result = await request(authSessionResponseSchema, '/api/auth/researcher', {
    method: 'POST',
    body: { code },
  })
  adoptSession(result)
  return result
}

/** POST /api/auth/signup → 201 | 400 | 409 EMAIL_ALREADY_REGISTERED */
export async function signup(body: SignupRequest): Promise<AuthSessionResponse> {
  const result = await request(authSessionResponseSchema, '/api/auth/signup', {
    method: 'POST',
    body,
  })
  adoptSession(result)
  return result
}

/**
 * POST /api/auth/resume → 200 | 401
 * The reminder-link path (user story 2.1): works on a brand-new device with no
 * cookie, and exchanges the link id for a real session.
 */
export async function resume(reminderLinkId: string): Promise<AuthSessionResponse> {
  const result = await request(authSessionResponseSchema, '/api/auth/resume', {
    method: 'POST',
    body: { reminderLinkId },
  })
  adoptSession(result)
  return result
}

/**
 * POST /api/auth/signout → 200
 * Deletes the server-side session and clears the httpOnly cookie, then wipes
 * this device's stored token and link id. Local state is cleared even if the
 * request fails — a practitioner tapping "sign out" on a borrowed phone must
 * end up signed out on that phone whatever the network did.
 */
export async function signOut(): Promise<void> {
  try {
    await request(z.object({ signedOut: z.boolean() }), '/api/auth/signout', {
      method: 'POST',
    })
  } finally {
    clearSession()
  }
}

function adoptSession(result: AuthSessionResponse): void {
  setSessionToken(result.sessionToken)
  setReminderLinkId(result.practitioner.reminderLinkId)
}

/**
 * GET /api/auth/me → 200 | 401
 * `reminderLinkId` is passed as `?k=` so a cold device can identify itself on
 * the very first request rather than needing a resume round-trip first.
 */
export function me(reminderLinkId?: string | null): Promise<MeResponse> {
  return request(meResponseSchema, '/api/auth/me', { reminderLinkId })
}

/** POST /api/auth/onboarded → 200 | 401 (FR2) */
export function markOnboarded(): Promise<MeResponse> {
  return request(meResponseSchema, '/api/auth/onboarded', { method: 'POST' })
}

/** GET /api/taxonomy → 200. Cached client-side; see `taxonomy-cache.ts`. */
export function getTaxonomy(): Promise<TaxonomyResponse> {
  return request(taxonomyResponseSchema, '/api/taxonomy')
}

/** GET /api/logs/:date → 200 | 404 */
export function getLog(logDate: string): Promise<DailyLog> {
  return request(dailyLogSchema, `/api/logs/${logDate}`)
}

/** PUT /api/logs/:date → 200 (updated) | 201 (created) */
export function putLog(logDate: string, body: DailyLogRequest): Promise<DailyLog> {
  return request(dailyLogSchema, `/api/logs/${logDate}`, { method: 'PUT', body })
}

/** GET /api/logs → 200 — the practitioner's own recent days. */
export async function listLogs(): Promise<DailyLog[]> {
  const result = await request(dailyLogListResponseSchema, '/api/logs')
  return result.logs
}

/* ------------------------------------------------------------------ *
 * Researcher dashboard (FR8). RESEARCHER role only; a practitioner's
 * session gets a 403 from every one of these.
 * ------------------------------------------------------------------ */

/**
 * The dashboard filter as the UI holds it: every field optional and a string,
 * because that is what a `<select>` and a date input give you. Empty values are
 * dropped rather than sent, since the server reads `?category=` as "no filter"
 * but there is no reason to make it do that work.
 */
export type DashboardQuery = Partial<
  Record<
    | 'from'
    | 'to'
    | 'category'
    | 'conditionCode'
    | 'diagnosisBasis'
    | 'alsoSeeingGp'
    | 'referredByGp'
    | 'patientType'
    | 'page'
    | 'pageSize',
    string | number | null | undefined
  >
>

export function dashboardQueryString(query: DashboardQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text.length > 0) params.set(key, text)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** GET /api/dashboard/summary → 200 | 401 | 403 */
export function getDashboardSummary(query: DashboardQuery = {}): Promise<DashboardSummary> {
  return request(
    dashboardSummarySchema,
    `/api/dashboard/summary${dashboardQueryString(query)}`,
  )
}

/** GET /api/dashboard/entries → 200 | 401 | 403 */
export function getDashboardEntries(
  query: DashboardQuery = {},
): Promise<DashboardEntriesResponse> {
  return request(
    dashboardEntriesResponseSchema,
    `/api/dashboard/entries${dashboardQueryString(query)}`,
  )
}

/**
 * The CSV is a browser download, not a parsed response, so this returns the URL
 * for a plain link rather than fetching it. The session cookie authenticates
 * the navigation; a fetch + blob would work too but would put the whole export
 * through memory on a machine that may be downloading a year of data.
 */
export function dashboardExportUrl(query: DashboardQuery = {}): string {
  return `/api/dashboard/export${dashboardQueryString(query)}`
}
