/**
 * Canonical enum values for the HSA collection app.
 *
 * SQLite has no native enum type, so every "enum" column in schema.prisma is a
 * String. These constants are the single source of truth for what those strings
 * may contain, and the Zod schemas below are what actually enforce it at each
 * API boundary. Never hand-write one of these string literals elsewhere —
 * import from here so a rename is a compile error rather than a silent
 * mismatch between the form, the API and the export.
 *
 * OWNERSHIP: integration lead. Agents read; they do not edit.
 */
import { z } from 'zod'

/* ------------------------------------------------------------------ *
 * Condition categories (FR4) — exactly 5, fixed by the product owner.
 * ------------------------------------------------------------------ */

export const CONDITION_CATEGORIES = [
  'MENTAL_HEALTH',
  'WOMENS_HEALTH_HORMONES',
  'COMMUNICABLE',
  'NON_COMMUNICABLE_CHRONIC',
  'OTHER',
] as const

export type ConditionCategory = (typeof CONDITION_CATEGORIES)[number]

/** Display labels. The UI must render these, not the raw codes. */
export const CONDITION_CATEGORY_LABELS: Record<ConditionCategory, string> = {
  MENTAL_HEALTH: 'Mental Health',
  WOMENS_HEALTH_HORMONES: "Women's Health & Hormones",
  COMMUNICABLE: 'Communicable (Infectious) Diseases',
  NON_COMMUNICABLE_CHRONIC: 'Non-communicable / Chronic Diseases',
  OTHER: 'Other',
}

/* ------------------------------------------------------------------ *
 * Patient type (FR3)
 *
 * Every condition is recorded against a patient, and every patient is one of
 * these two. The day's counts decide how many of each the form asks about.
 * ------------------------------------------------------------------ */

export const PATIENT_TYPES = ['NEW', 'FOLLOW_UP'] as const
export type PatientType = (typeof PATIENT_TYPES)[number]

export const PATIENT_TYPE_LABELS: Record<PatientType, string> = {
  NEW: 'New',
  FOLLOW_UP: 'Returning',
}

/* ------------------------------------------------------------------ *
 * Diagnosis basis (FR5)
 * ------------------------------------------------------------------ */

export const DIAGNOSIS_BASES = [
  'CLINICAL_DIAGNOSIS',
  'PATIENT_REPORTED_PRIOR',
  'PRESENTING_COMPLAINT_ONLY',
] as const

export type DiagnosisBasis = (typeof DIAGNOSIS_BASES)[number]

/**
 * The question the form asks above these options. Kept beside the labels so the
 * wording and the values it produces can never drift apart.
 */
export const DIAGNOSIS_BASIS_QUESTION = 'How did you arrive at diagnosis?'

export const DIAGNOSIS_BASIS_LABELS: Record<DiagnosisBasis, string> = {
  CLINICAL_DIAGNOSIS: 'My diagnosis',
  PATIENT_REPORTED_PRIOR: 'Patient-reported',
  PRESENTING_COMPLAINT_ONLY: 'Complaint only',
}

/**
 * The product owner's "most common option" default (FR5). The UI preselects
 * this so the flag costs no time, but must leave it editable.
 */
export const DEFAULT_DIAGNOSIS_BASIS: DiagnosisBasis = 'CLINICAL_DIAGNOSIS'

/* ------------------------------------------------------------------ *
 * Referral / co-management (FR6)
 * ------------------------------------------------------------------ */

/**
 * The column names still say "Gp" because they are the stable keys the dataset
 * and the CSV export are written in; the questions practitioners actually read
 * say "conventional medical practitioner", which is what the product owner
 * asked for and what a homeopath would recognise.
 */
export const ALSO_SEEING_GP_QUESTION =
  'Is the patient also seeing a conventional medical practitioner for this?'
export const REFERRED_BY_GP_QUESTION =
  'Was the patient referred by a conventional medical practitioner?'

export const GP_CO_MANAGEMENT = ['YES', 'NO', 'UNSURE'] as const
export type GpCoManagement = (typeof GP_CO_MANAGEMENT)[number]

export const GP_CO_MANAGEMENT_LABELS: Record<GpCoManagement, string> = {
  YES: 'Yes',
  NO: 'No',
  UNSURE: 'Unsure',
}

export const REFERRED_BY_GP = ['YES', 'NO', 'NOT_APPLICABLE'] as const
export type ReferredByGp = (typeof REFERRED_BY_GP)[number]

export const REFERRED_BY_GP_LABELS: Record<ReferredByGp, string> = {
  YES: 'Yes',
  NO: 'No',
  NOT_APPLICABLE: 'N/A',
}

export const DEFAULT_GP_CO_MANAGEMENT: GpCoManagement = 'UNSURE'
export const DEFAULT_REFERRED_BY_GP: ReferredByGp = 'NOT_APPLICABLE'

/* ------------------------------------------------------------------ *
 * Reminders (FR7)
 * ------------------------------------------------------------------ */

export const REMINDER_CHANNELS = ['NONE', 'EMAIL', 'WHATSAPP'] as const
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number]

export const REMINDER_CHANNEL_LABELS: Record<ReminderChannel, string> = {
  NONE: 'No reminders',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
}

export const DISPATCH_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number]

export const SKIP_REASONS = [
  'ALREADY_LOGGED',
  'MARKED_DONE',
  'SNOOZED',
  'NOT_OPTED_IN',
  'NON_WORKING_DAY',
] as const
export type SkipReason = (typeof SKIP_REASONS)[number]

/** Default reminder time, SAST. */
export const DEFAULT_REMINDER_TIME = '18:00'

/* ------------------------------------------------------------------ *
 * Roles
 * ------------------------------------------------------------------ */

export const ROLES = ['PRACTITIONER', 'RESEARCHER'] as const
export type Role = (typeof ROLES)[number]

/* ------------------------------------------------------------------ *
 * Zod schemas — the enforcement layer
 * ------------------------------------------------------------------ */

export const conditionCategorySchema = z.enum(CONDITION_CATEGORIES)
export const patientTypeSchema = z.enum(PATIENT_TYPES)
export const diagnosisBasisSchema = z.enum(DIAGNOSIS_BASES)
export const gpCoManagementSchema = z.enum(GP_CO_MANAGEMENT)
export const referredByGpSchema = z.enum(REFERRED_BY_GP)
export const reminderChannelSchema = z.enum(REMINDER_CHANNELS)
export const dispatchStatusSchema = z.enum(DISPATCH_STATUSES)
export const skipReasonSchema = z.enum(SKIP_REASONS)
export const roleSchema = z.enum(ROLES)

/**
 * A SAST calendar date, "yyyy-MM-dd". Used for DailyLog.logDate,
 * DayOverride.logDate and ReminderDispatch.logDate. Rejects "2026-10-32"
 * and similar, which a bare regex would let through.
 */
export const logDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in yyyy-MM-dd format')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number)
    const parsed = new Date(Date.UTC(y, m - 1, d))
    return (
      parsed.getUTCFullYear() === y &&
      parsed.getUTCMonth() === m - 1 &&
      parsed.getUTCDate() === d
    )
  }, 'Not a real calendar date')

/** A reminder time of day, "HH:mm", 24-hour, SAST. */
export const reminderTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in 24-hour HH:mm format')

/** The IANA zone every date in this system is reckoned against. */
export const SAST_TIME_ZONE = 'Africa/Johannesburg'
