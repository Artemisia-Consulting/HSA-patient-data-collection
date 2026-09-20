/**
 * The frontend's whole view of the backend. Nine calls, each one a thin
 * wrapper over `request()` with the contract's own response schema. Nothing in
 * `src/app` or `src/components` calls `fetch` directly.
 *
 * OWNER: Stream 2.
 */
import {
  type AuthSessionResponse,
  type DailyLog,
  type DailyLogRequest,
  type MeResponse,
  type SignupRequest,
  type TaxonomyResponse,
  authSessionResponseSchema,
  dailyLogListResponseSchema,
  dailyLogSchema,
  meResponseSchema,
  taxonomyResponseSchema,
} from '../contract/api'
import { request } from './http'
import { setReminderLinkId, setSessionToken } from './session'

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
