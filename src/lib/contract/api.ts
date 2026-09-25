/**
 * The HTTP contract between the three build streams.
 *
 *   Agent 1 (backend)   — implements every route below.
 *   Agent 2 (frontend)  — consumes the auth / taxonomy / log routes.
 *   Agent 3 (reminders) — implements the /api/reminders/* routes and reads
 *                         the log routes to decide whether to suppress a send.
 *
 * Both sides import the same Zod schemas: the server parses requests with
 * them, the client derives its TypeScript types from them. A field renamed
 * here is a compile error on both sides rather than a runtime surprise during
 * October, which is the entire point of fixing this before the fan-out.
 *
 * OWNERSHIP: integration lead. Agents read; they do not edit. If your slice
 * needs a field that is not here, report it — do not add it locally.
 */
import { z } from 'zod'
import {
  conditionCategorySchema,
  diagnosisBasisSchema,
  gpCoManagementSchema,
  logDateSchema,
  patientTypeSchema,
  reminderChannelSchema,
  reminderTimeSchema,
  referredByGpSchema,
  roleSchema,
} from './enums'

/* ================================================================== *
 * Conventions
 * ================================================================== */

/**
 * Every non-2xx response has this shape. `code` is stable and machine-readable;
 * `message` is safe to show a practitioner on their phone. `fieldErrors` maps a
 * form field to its problem so the frontend can mark inputs without guessing.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
})
export type ApiError = z.infer<typeof apiErrorSchema>

/**
 * Stable error codes and the HTTP status each must be returned with.
 * Agent 1 owns adherence; agents 2 and 3 may branch on these.
 */
export const API_ERROR_CODES = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  EMAIL_ALREADY_REGISTERED: 409,
  OUTSIDE_COLLECTION_WINDOW: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const satisfies Record<string, number>

export type ApiErrorCode = keyof typeof API_ERROR_CODES

/**
 * How a request proves who it is. Both are accepted on every practitioner
 * route, checked in this order:
 *
 *  1. `Authorization: Bearer <sessionToken>` — or the `hsa_session` cookie,
 *     which is how the PWA stays logged in on-device (FR1).
 *  2. `?k=<reminderLinkId>` — the personalised reminder link, which must work
 *     on a brand-new device with no cookie at all (FR1, user story 2.1).
 *
 * A request arriving with a valid `k` and no session is issued a fresh session
 * cookie, so following a reminder link on a new phone silently logs you in.
 */
export const REMINDER_LINK_QUERY_PARAM = 'k'
export const SESSION_COOKIE_NAME = 'hsa_session'
export const SESSION_TTL_DAYS = 120

/**
 * Google sign-in (Better Auth) — the URLs, kept here rather than in the server
 * module so a component can link to them without importing Prisma and
 * Better Auth into the browser bundle.
 *
 * `/api/auth/google/start` is a GET that 302s to Google. `/api/oauth/*` is
 * where Better Auth itself is mounted — NOT `/api/auth/*`, which this app's
 * own routes already occupy. See src/lib/server/googleAuth.ts.
 */
export const OAUTH_BASE_PATH = '/api/oauth'
export const GOOGLE_START_PATH = '/api/auth/google/start'
export const GOOGLE_FINISH_PATH = '/api/auth/google/finish'

/* ================================================================== *
 * Practitioner
 * ================================================================== */

/**
 * The practitioner as returned to *that practitioner*. Includes their own
 * email, because it is their own data. Never reuse this shape on a dashboard
 * route — see `anonymisedPractitionerSchema`.
 */
export const practitionerSchema = z.object({
  id: z.string(),
  email: z.email(),
  fullName: z.string(),
  practiceName: z.string().nullable(),
  province: z.string().nullable(),
  reminderLinkId: z.string(),
  role: roleSchema,
  onboardedAt: z.iso.datetime().nullable(),
  /**
   * When the practitioner first answered the reminder question (email or
   * none). Null means they have not been asked yet — the app shows the
   * one-off choice screen until it is set, then never again.
   */
  reminderChoiceAt: z.iso.datetime().nullable(),
  consentAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
})
export type Practitioner = z.infer<typeof practitionerSchema>

/**
 * POPIA: the only practitioner shape permitted in a dashboard or export
 * response. There is no email field, and there is no way to add one without
 * changing this schema — which is the safeguard.
 */
export const anonymisedPractitionerSchema = z.object({
  id: z.string(),
  province: z.string().nullable(),
})
export type AnonymisedPractitioner = z.infer<typeof anonymisedPractitionerSchema>

/* ================================================================== *
 * POST /api/auth/signup   → 201 | 409 EMAIL_ALREADY_REGISTERED
 * ================================================================== */

export const signupRequestSchema = z.object({
  email: z.email('Please enter a valid email address'),
  fullName: z.string().trim().min(2, 'Please enter your name').max(120),
  practiceName: z.string().trim().max(160).optional(),
  province: z.string().trim().max(80).optional(),
  /**
   * Must be true. Ticking it *is* the consent record (user story 1.6) — there
   * is no verification step and no cross-check against the survey.
   */
  consent: z.literal(true, {
    message: 'Please confirm you agree to take part',
  }),
})
export type SignupRequest = z.infer<typeof signupRequestSchema>

export const authSessionResponseSchema = z.object({
  practitioner: practitionerSchema,
  /** Raw bearer token. Returned once, stored hashed. Also set as a cookie. */
  sessionToken: z.string(),
  sessionExpiresAt: z.iso.datetime(),
  /** Pre-built personalised link for reminders: `${APP_URL}/log?k=...`. */
  reminderLink: z.url(),
})
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>

/* ================================================================== *
 * GET  /api/auth/me       → 200 | 401
 * POST /api/auth/resume   → 200 | 401   body: { reminderLinkId }
 * POST /api/auth/onboarded → 200 | 401  marks onboarding complete (FR2)
 * ================================================================== */

export const resumeRequestSchema = z.object({
  reminderLinkId: z.string().min(8),
})
export type ResumeRequest = z.infer<typeof resumeRequestSchema>

export const meResponseSchema = z.object({
  practitioner: practitionerSchema,
  /** Today in SAST, so the client never has to trust the device clock. */
  today: logDateSchema,
  /** Whether a DailyLog already exists for `today`. Drives the UI's "done" state. */
  hasLoggedToday: z.boolean(),
})
export type MeResponse = z.infer<typeof meResponseSchema>

/* ================================================================== *
 * GET /api/taxonomy → 200
 * Cacheable. Served from the Condition table so the list can be extended
 * during October without a redeploy.
 * ================================================================== */

export const taxonomyConditionSchema = z.object({
  code: z.string(),
  label: z.string(),
  /** Extra search terms for the typeahead. Not displayed. */
  synonyms: z.array(z.string()),
  rank: z.number().int(),
  /** True for the per-category "Other (specify)" row, which needs free text. */
  isOther: z.boolean(),
})

export const taxonomyCategorySchema = z.object({
  code: conditionCategorySchema,
  label: z.string(),
  conditions: z.array(taxonomyConditionSchema),
})

export const taxonomyResponseSchema = z.object({
  categories: z.array(taxonomyCategorySchema),
  /** Changes whenever the list is edited; lets the PWA cache and revalidate. */
  version: z.string(),
})
export type TaxonomyResponse = z.infer<typeof taxonomyResponseSchema>

/* ================================================================== *
 * Daily log
 *
 * GET /api/logs/:date  → 200 | 404   the practitioner's log for that date
 * PUT /api/logs/:date  → 200 | 201   upsert (one row per practitioner per day)
 * GET /api/logs        → 200         the practitioner's own recent logs
 * ================================================================== */

/**
 * One condition treated for one patient. There is no identifier of any kind:
 * a row says "this was treated", never for whom.
 */
export const conditionEntryInputSchema = z
  .object({
    category: conditionCategorySchema,
    conditionCode: z.string().min(1),
    /** Required when `conditionCode` is the category's "Other" row. */
    conditionOther: z.string().trim().max(120).optional(),
    diagnosisBasis: diagnosisBasisSchema,
    alsoSeeingGp: gpCoManagementSchema,
    referredByGp: referredByGpSchema,
  })
  .refine(
    (entry) =>
      !entry.conditionCode.endsWith('__OTHER') ||
      (entry.conditionOther?.length ?? 0) > 0,
    {
      message: 'Please describe the condition',
      path: ['conditionOther'],
    },
  )
export type ConditionEntryInput = z.infer<typeof conditionEntryInputSchema>

/**
 * One patient seen that day, and what was treated for them.
 *
 * `conditions` may be empty. A practitioner who saw twelve new patients but
 * only wants to itemise three still submits twelve patients — nine of them
 * blank — because the day's counts are what decide how many there are.
 */
export const patientEntryInputSchema = z.object({
  patientType: patientTypeSchema,
  conditions: z.array(conditionEntryInputSchema).max(20),
})
export type PatientEntryInput = z.infer<typeof patientEntryInputSchema>

/**
 * The counts and the patient list have to agree, and the server is where that
 * is settled. The client builds one patient per counted patient, so a mismatch
 * means a client bug — and silently trusting either side would make
 * `newPatients` and "the number of new patients in the data" two different
 * numbers in the exported dataset.
 */
export const dailyLogRequestSchema = z
  .object({
    newPatients: z.number().int().min(0).max(200),
    followUpPatients: z.number().int().min(0).max(200),
    patients: z.array(patientEntryInputSchema).max(400),
  })
  .superRefine((body, ctx) => {
    const counted = (type: 'NEW' | 'FOLLOW_UP') =>
      body.patients.filter((patient) => patient.patientType === type).length

    if (counted('NEW') !== body.newPatients) {
      ctx.addIssue({
        code: 'custom',
        path: ['patients'],
        message: `Expected ${body.newPatients} new patient entries, got ${counted('NEW')}`,
      })
    }
    if (counted('FOLLOW_UP') !== body.followUpPatients) {
      ctx.addIssue({
        code: 'custom',
        path: ['patients'],
        message: `Expected ${body.followUpPatients} returning patient entries, got ${counted('FOLLOW_UP')}`,
      })
    }
  })
export type DailyLogRequest = z.infer<typeof dailyLogRequestSchema>

export const conditionEntrySchema = z.object({
  id: z.string(),
  category: conditionCategorySchema,
  conditionCode: z.string(),
  conditionOther: z.string().nullable(),
  diagnosisBasis: diagnosisBasisSchema,
  alsoSeeingGp: gpCoManagementSchema,
  referredByGp: referredByGpSchema,
})

export const patientEntrySchema = z.object({
  id: z.string(),
  patientType: patientTypeSchema,
  /** 1-based position within its type. Ordering only — never an identity. */
  position: z.number().int(),
  conditions: z.array(conditionEntrySchema),
})
export type PatientEntry = z.infer<typeof patientEntrySchema>

export const dailyLogSchema = z.object({
  id: z.string(),
  logDate: logDateSchema,
  newPatients: z.number().int(),
  followUpPatients: z.number().int(),
  totalPatients: z.number().int(),
  patients: z.array(patientEntrySchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type DailyLog = z.infer<typeof dailyLogSchema>

export const dailyLogListResponseSchema = z.object({
  logs: z.array(dailyLogSchema),
})

/* ================================================================== *
 * Reminders — owned by Agent 3
 *
 * GET /api/reminders/preferences → 200 | 401
 * PUT /api/reminders/preferences → 200 | 400
 * POST /api/reminders/snooze     → 200   body: { minutes }
 * POST /api/reminders/done-today → 200   suppress today without a log entry
 * POST /api/reminders/dispatch   → 200   cron-triggered, CRON_SECRET required
 * ================================================================== */

export const reminderPreferencesSchema = z.object({
  channel: reminderChannelSchema,
  /** "HH:mm" in SAST. */
  time: reminderTimeSchema,
  includeSaturday: z.boolean(),
})
export type ReminderPreferences = z.infer<typeof reminderPreferencesSchema>

export const snoozeRequestSchema = z.object({
  minutes: z.number().int().min(5).max(360),
})

export const reminderStatusResponseSchema = z.object({
  preferences: reminderPreferencesSchema,
  today: logDateSchema,
  hasLoggedToday: z.boolean(),
  markedDoneToday: z.boolean(),
  snoozedUntil: z.iso.datetime().nullable(),
  /** When the next reminder would fire, or null if none is scheduled. */
  nextReminderAt: z.iso.datetime().nullable(),
})
export type ReminderStatusResponse = z.infer<typeof reminderStatusResponseSchema>

export const dispatchResultSchema = z.object({
  runAt: z.iso.datetime(),
  forDate: logDateSchema,
  considered: z.number().int(),
  sent: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
})
export type DispatchResult = z.infer<typeof dispatchResultSchema>

/* ================================================================== *
 * Researcher dashboard — read endpoints owned by Agent 1
 *
 * GET /api/dashboard/summary  → 200 | 403 (RESEARCHER role only)
 * GET /api/dashboard/entries  → 200 | 403
 * GET /api/dashboard/export   → 200 text/csv
 *
 * POPIA: responses carry Practitioner.id only. Never an email.
 * ================================================================== */

export const dashboardFilterSchema = z.object({
  from: logDateSchema.optional(),
  to: logDateSchema.optional(),
  category: conditionCategorySchema.optional(),
  conditionCode: z.string().optional(),
  diagnosisBasis: diagnosisBasisSchema.optional(),
  alsoSeeingGp: gpCoManagementSchema.optional(),
  referredByGp: referredByGpSchema.optional(),
  /** "new" | "followup" | omitted for both. */
  patientType: z.enum(['new', 'followup']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
})
export type DashboardFilter = z.infer<typeof dashboardFilterSchema>

export const dashboardSummarySchema = z.object({
  totals: z.object({
    practitioners: z.number().int(),
    practitionersReporting: z.number().int(),
    logDays: z.number().int(),
    newPatients: z.number().int(),
    followUpPatients: z.number().int(),
    totalPatients: z.number().int(),
    conditionEntries: z.number().int(),
  }),
  /** Daily series for the trend chart. */
  byDate: z.array(
    z.object({
      logDate: logDateSchema,
      newPatients: z.number().int(),
      followUpPatients: z.number().int(),
    }),
  ),
  byCategory: z.array(
    z.object({
      category: conditionCategorySchema,
      label: z.string(),
      entries: z.number().int(),
    }),
  ),
  /** The impact/necessity numbers the HSA report is actually built on. */
  coManagement: z.object({
    alsoSeeingGpYes: z.number().int(),
    alsoSeeingGpNo: z.number().int(),
    alsoSeeingGpUnsure: z.number().int(),
    referredByGpYes: z.number().int(),
    referredByGpNo: z.number().int(),
    referredByGpNotApplicable: z.number().int(),
  }),
  byDiagnosisBasis: z.array(
    z.object({
      diagnosisBasis: diagnosisBasisSchema,
      entries: z.number().int(),
    }),
  ),
  /**
   * Questions only the patient-level model can answer: how the condition load
   * splits between first visits and follow-ups, and how often one patient
   * presents with more than one thing.
   */
  byPatientType: z.array(
    z.object({
      patientType: patientTypeSchema,
      patients: z.number().int(),
      entries: z.number().int(),
    }),
  ),
  patientsWithMultipleConditions: z.number().int(),
})
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>

/** One flattened row — matches the CSV export column-for-column. */
export const dashboardEntryRowSchema = z.object({
  logId: z.string(),
  practitionerId: z.string(),
  province: z.string().nullable(),
  logDate: logDateSchema,
  newPatients: z.number().int(),
  followUpPatients: z.number().int(),
  /**
   * Groups rows belonging to the same patient visit, so two conditions on one
   * patient are analysable as such. Random per visit and never reused, so it
   * cannot link an individual across days.
   */
  patientId: z.string().nullable(),
  patientType: patientTypeSchema.nullable(),
  category: conditionCategorySchema.nullable(),
  conditionCode: z.string().nullable(),
  conditionLabel: z.string().nullable(),
  diagnosisBasis: diagnosisBasisSchema.nullable(),
  alsoSeeingGp: gpCoManagementSchema.nullable(),
  referredByGp: referredByGpSchema.nullable(),
})
export type DashboardEntryRow = z.infer<typeof dashboardEntryRowSchema>

export const dashboardEntriesResponseSchema = z.object({
  rows: z.array(dashboardEntryRowSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalRows: z.number().int(),
})
export type DashboardEntriesResponse = z.infer<typeof dashboardEntriesResponseSchema>

/* ================================================================== *
 * GET /api/health → 200
 * Hit every few minutes by the external ping bot to defeat cold starts.
 * Must stay cheap: one trivial query, no auth, no caching.
 * ================================================================== */

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptimeSeconds: z.number(),
  database: z.enum(['ok', 'error']),
  timestamp: z.iso.datetime(),
  version: z.string(),
})
export type HealthResponse = z.infer<typeof healthResponseSchema>
