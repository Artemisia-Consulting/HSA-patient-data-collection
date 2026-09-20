/**
 * An in-browser stand-in for Agent 1's routes.
 *
 * It is deliberately written as a `fetch`-shaped function returning real
 * `Response` objects, so `http.ts` runs identical code against it and against
 * the real API. Every success body is built to satisfy the Zod schema in
 * `src/lib/contract/api.ts`; `tests/frontend/mock-contract.test.ts` parses each
 * one with that schema so drift fails the build rather than October.
 *
 * What it faithfully reproduces, because the frontend branches on it:
 *   - 201 on signup, 409 EMAIL_ALREADY_REGISTERED on a repeat email
 *   - 401 UNAUTHENTICATED with no token and no `?k=`
 *   - 400 VALIDATION_FAILED with `fieldErrors`, from the contract schemas
 *   - 200 vs 201 on the log upsert, 404 on a date with no log
 *   - a small artificial latency, so loading states are real
 *
 * What it does NOT reproduce: rate limiting, the collection-window 422, and
 * cookie-based auth. See docs/streams/frontend.md.
 *
 * OWNER: Stream 2. Delete this whole folder at integration.
 */
import {
  type AuthSessionResponse,
  type DailyLog,
  type MeResponse,
  type Practitioner,
  type TaxonomyResponse,
  dailyLogRequestSchema,
  resumeRequestSchema,
  signupRequestSchema,
} from '../../contract/api'
import { CONDITION_CATEGORIES, CONDITION_CATEGORY_LABELS } from '../../contract/enums'
import { CONDITION_TAXONOMY, isOtherCondition } from '../../contract/taxonomy'
import { todayInSast } from '../../dates'
import { mockId, readDb, writeDb } from './db'

/* ------------------------------------------------------------------ *
 * Knobs — used by the dev "simulate offline" toggle and by tests.
 * ------------------------------------------------------------------ */

let latencyMs = 180
let forcedOffline = false

export function setMockLatency(ms: number): void {
  latencyMs = Math.max(0, ms)
}

export function setMockOffline(offline: boolean): void {
  forcedOffline = offline
}

export function isMockOffline(): boolean {
  return forcedOffline
}

const wait = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

/* ------------------------------------------------------------------ *
 * Response helpers
 * ------------------------------------------------------------------ */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fail(
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>,
): Response {
  return json({ error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } }, status)
}

const UNAUTHENTICATED = () =>
  fail(401, 'UNAUTHENTICATED', 'Please sign up or open your reminder link again.')

function appUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:3000'
}

/* ------------------------------------------------------------------ *
 * Auth resolution — mirrors the contract's documented order:
 * Bearer token first, then the ?k= reminder link.
 * ------------------------------------------------------------------ */

function bearerFrom(init?: RequestInit): string | null {
  const headers = init?.headers
  if (!headers) return null
  const raw =
    headers instanceof Headers
      ? headers.get('Authorization')
      : Array.isArray(headers)
        ? (headers.find(([key]) => key.toLowerCase() === 'authorization')?.[1] ?? null)
        : ((headers as Record<string, string>).Authorization ??
          (headers as Record<string, string>).authorization ??
          null)
  if (!raw) return null
  return raw.startsWith('Bearer ') ? raw.slice(7) : raw
}

function resolveAuth(url: URL, init?: RequestInit) {
  const db = readDb()
  const token = bearerFrom(init)
  if (token) {
    const record = db.practitioners.find((p) => p.sessionToken === token)
    if (record) return record
  }
  const linkId = url.searchParams.get('k')
  if (linkId) {
    const record = db.practitioners.find(
      (p) => p.practitioner.reminderLinkId === linkId,
    )
    if (record) return record
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

function sessionResponse(
  record: { practitioner: Practitioner; sessionToken: string; sessionExpiresAt: string },
): AuthSessionResponse {
  return {
    practitioner: record.practitioner,
    sessionToken: record.sessionToken,
    sessionExpiresAt: record.sessionExpiresAt,
    reminderLink: `${appUrl()}/log?k=${record.practitioner.reminderLinkId}`,
  }
}

function taxonomyResponse(): TaxonomyResponse {
  return {
    categories: CONDITION_CATEGORIES.map((category) => ({
      code: category,
      label: CONDITION_CATEGORY_LABELS[category],
      conditions: CONDITION_TAXONOMY.filter((c) => c.category === category)
        .slice()
        .sort((a, b) => (a.rank ?? 100) - (b.rank ?? 100))
        .map((c) => ({
          code: c.code,
          label: c.label,
          synonyms: c.synonyms ?? [],
          rank: c.rank ?? 100,
          isOther: isOtherCondition(c.code),
        })),
    })),
    version: 'mock-1',
  }
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

async function bodyOf(init?: RequestInit): Promise<unknown> {
  if (typeof init?.body !== 'string') return undefined
  try {
    return JSON.parse(init.body)
  } catch {
    return undefined
  }
}

function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string[]> = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_'
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}

async function handleSignup(init?: RequestInit): Promise<Response> {
  const parsed = signupRequestSchema.safeParse(await bodyOf(init))
  if (!parsed.success) {
    return fail(
      400,
      'VALIDATION_FAILED',
      'Please check the highlighted fields.',
      zodFieldErrors(parsed.error.issues),
    )
  }

  const db = readDb()
  const email = parsed.data.email.trim().toLowerCase()
  if (db.practitioners.some((p) => p.practitioner.email.toLowerCase() === email)) {
    return fail(
      409,
      'EMAIL_ALREADY_REGISTERED',
      'That email is already signed up. We can send your logging link to it.',
      { email: ['This email is already registered'] },
    )
  }

  const now = new Date().toISOString()
  const practitioner: Practitioner = {
    id: mockId('prc'),
    email,
    fullName: parsed.data.fullName,
    practiceName: parsed.data.practiceName?.trim() || null,
    province: parsed.data.province?.trim() || null,
    reminderLinkId: mockId('lnk'),
    role: 'PRACTITIONER',
    onboardedAt: null,
    consentAt: now,
    createdAt: now,
  }
  const record = {
    practitioner,
    sessionToken: mockId('tok'),
    sessionExpiresAt: new Date(Date.now() + 120 * 86_400_000).toISOString(),
  }
  db.practitioners.push(record)
  db.logs[practitioner.id] = {}
  writeDb(db)

  return json(sessionResponse(record), 201)
}

async function handleResume(init?: RequestInit): Promise<Response> {
  const parsed = resumeRequestSchema.safeParse(await bodyOf(init))
  if (!parsed.success) {
    return fail(
      400,
      'VALIDATION_FAILED',
      'That link does not look right.',
      zodFieldErrors(parsed.error.issues),
    )
  }
  const db = readDb()
  const record = db.practitioners.find(
    (p) => p.practitioner.reminderLinkId === parsed.data.reminderLinkId,
  )
  if (!record) return UNAUTHENTICATED()
  // A resume issues a fresh session, exactly as the contract describes.
  record.sessionToken = mockId('tok')
  record.sessionExpiresAt = new Date(Date.now() + 120 * 86_400_000).toISOString()
  writeDb(db)
  return json(sessionResponse(record), 200)
}

function handleMe(url: URL, init?: RequestInit): Response {
  const record = resolveAuth(url, init)
  if (!record) return UNAUTHENTICATED()
  const today = todayInSast()
  const body: MeResponse = {
    practitioner: record.practitioner,
    today,
    hasLoggedToday: Boolean(readDb().logs[record.practitioner.id]?.[today]),
  }
  return json(body, 200)
}

function handleOnboarded(url: URL, init?: RequestInit): Response {
  const record = resolveAuth(url, init)
  if (!record) return UNAUTHENTICATED()
  const db = readDb()
  const stored = db.practitioners.find(
    (p) => p.practitioner.id === record.practitioner.id,
  )
  if (!stored) return UNAUTHENTICATED()
  stored.practitioner.onboardedAt = new Date().toISOString()
  writeDb(db)
  const today = todayInSast()
  const body: MeResponse = {
    practitioner: stored.practitioner,
    today,
    hasLoggedToday: Boolean(db.logs[stored.practitioner.id]?.[today]),
  }
  return json(body, 200)
}

function handleGetLog(url: URL, logDate: string, init?: RequestInit): Response {
  const record = resolveAuth(url, init)
  if (!record) return UNAUTHENTICATED()
  const log = readDb().logs[record.practitioner.id]?.[logDate]
  if (!log) return fail(404, 'NOT_FOUND', 'No log saved for that day yet.')
  return json(log, 200)
}

function handleListLogs(url: URL, init?: RequestInit): Response {
  const record = resolveAuth(url, init)
  if (!record) return UNAUTHENTICATED()
  const logs = Object.values(readDb().logs[record.practitioner.id] ?? {}).sort(
    (a, b) => b.logDate.localeCompare(a.logDate),
  )
  return json({ logs }, 200)
}

async function handlePutLog(
  url: URL,
  logDate: string,
  init?: RequestInit,
): Promise<Response> {
  const record = resolveAuth(url, init)
  if (!record) return UNAUTHENTICATED()

  const parsed = dailyLogRequestSchema.safeParse(await bodyOf(init))
  if (!parsed.success) {
    return fail(
      400,
      'VALIDATION_FAILED',
      'Please check the highlighted fields.',
      zodFieldErrors(parsed.error.issues),
    )
  }

  const db = readDb()
  const forPractitioner = (db.logs[record.practitioner.id] ??= {})
  const existing = forPractitioner[logDate]
  const now = new Date().toISOString()

  const log: DailyLog = {
    id: existing?.id ?? mockId('log'),
    logDate,
    newPatients: parsed.data.newPatients,
    followUpPatients: parsed.data.followUpPatients,
    totalPatients: parsed.data.newPatients + parsed.data.followUpPatients,
    conditions: parsed.data.conditions.map((entry) => ({
      id: mockId('ce'),
      category: entry.category,
      conditionCode: entry.conditionCode,
      conditionOther: entry.conditionOther?.trim() || null,
      diagnosisBasis: entry.diagnosisBasis,
      alsoSeeingGp: entry.alsoSeeingGp,
      referredByGp: entry.referredByGp,
    })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  forPractitioner[logDate] = log
  writeDb(db)

  return json(log, existing ? 200 : 201)
}

/* ------------------------------------------------------------------ *
 * The fetch-shaped entry point
 * ------------------------------------------------------------------ */

export async function mockFetch(path: string, init?: RequestInit): Promise<Response> {
  await wait(latencyMs)
  if (forcedOffline) throw new TypeError('Failed to fetch (mock offline)')

  const url = new URL(path, 'http://mock.local')
  const method = (init?.method ?? 'GET').toUpperCase()
  const route = url.pathname

  if (route === '/api/auth/signup' && method === 'POST') return handleSignup(init)
  if (route === '/api/auth/resume' && method === 'POST') return handleResume(init)
  if (route === '/api/auth/onboarded' && method === 'POST')
    return handleOnboarded(url, init)
  if (route === '/api/auth/me' && method === 'GET') return handleMe(url, init)
  if (route === '/api/taxonomy' && method === 'GET') return json(taxonomyResponse(), 200)
  if (route === '/api/logs' && method === 'GET') return handleListLogs(url, init)

  const logMatch = /^\/api\/logs\/(\d{4}-\d{2}-\d{2})$/.exec(route)
  if (logMatch) {
    const logDate = logMatch[1]
    if (method === 'GET') return handleGetLog(url, logDate, init)
    if (method === 'PUT') return handlePutLog(url, logDate, init)
  }

  return fail(404, 'NOT_FOUND', 'Unknown endpoint.')
}
