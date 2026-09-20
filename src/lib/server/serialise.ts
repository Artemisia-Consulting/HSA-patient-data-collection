/**
 * Prisma row → contract shape.
 *
 * Nothing else in the API is allowed to hand-build one of these objects. The
 * point is that there is a single function per shape, so "does a dashboard
 * response contain an email?" is a question with one place to look.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import {
  anonymisedPractitionerSchema,
  type AnonymisedPractitioner,
  type AuthSessionResponse,
  type ConditionEntryInput,
  type DailyLog as DailyLogResponse,
  type PatientEntry as PatientEntryResponse,
  type Practitioner as PractitionerResponse,
} from '@/lib/contract'
import type {
  ConditionEntry,
  DailyLog,
  PatientEntry,
  Practitioner,
  Prisma,
} from '@/generated/prisma'

import { appUrl, isoString, isoStringOrNull } from './http'

export type PatientWithConditions = PatientEntry & { conditions: ConditionEntry[] }
export type DailyLogWithPatients = DailyLog & { patients: PatientWithConditions[] }

/**
 * The include every daily-log read uses, so the form always gets its patients
 * back in the order it drew them: New before Returning, then by position.
 *
 * `patientType: 'desc'` is what puts NEW first — the two values sort that way
 * alphabetically, and a database-side sort is worth the small indirection
 * because it keeps paging and the CSV in the same order as the form.
 */
export const LOG_PATIENT_INCLUDE = {
  patients: {
    orderBy: [{ patientType: 'desc' }, { position: 'asc' }],
    include: { conditions: { orderBy: { createdAt: 'asc' } } },
  },
} satisfies Prisma.DailyLogInclude

/**
 * The practitioner's own record, returned only to that practitioner. Includes
 * their email because it is their own data — never reuse this on a dashboard
 * route, which is what `toAnonymisedPractitioner` is for.
 */
export function toPractitionerResponse(p: Practitioner): PractitionerResponse {
  return {
    id: p.id,
    email: p.email,
    fullName: p.fullName,
    practiceName: p.practiceName,
    province: p.province,
    reminderLinkId: p.reminderLinkId,
    role: p.role === 'RESEARCHER' ? 'RESEARCHER' : 'PRACTITIONER',
    onboardedAt: isoStringOrNull(p.onboardedAt),
    consentAt: isoString(p.consentAt),
    createdAt: isoString(p.createdAt),
  }
}

/**
 * POPIA: the only practitioner shape a researcher may see. Built by parsing
 * through the contract schema, which strips everything that is not `id` or
 * `province` — so a future careless `...practitioner` spread still cannot leak
 * an email.
 */
export function toAnonymisedPractitioner(p: Practitioner): AnonymisedPractitioner {
  return anonymisedPractitionerSchema.parse(p)
}

/** `${APP_URL}/log?k=...` — the personalised one-tap link (FR1/FR7). */
export function buildReminderLink(reminderLinkId: string): string {
  return `${appUrl()}/log?k=${encodeURIComponent(reminderLinkId)}`
}

/** The payload shared by signup and resume: practitioner + fresh session. */
export function toAuthSessionResponse(
  practitioner: Practitioner,
  sessionToken: string,
  sessionExpiresAt: Date,
): AuthSessionResponse {
  return {
    practitioner: toPractitionerResponse(practitioner),
    sessionToken,
    sessionExpiresAt: isoString(sessionExpiresAt),
    reminderLink: buildReminderLink(practitioner.reminderLinkId),
  }
}

export function toConditionEntryResponse(entry: ConditionEntry) {
  return {
    id: entry.id,
    category: entry.category as ConditionEntryInput['category'],
    conditionCode: entry.conditionCode,
    conditionOther: entry.conditionOther,
    diagnosisBasis: entry.diagnosisBasis as ConditionEntryInput['diagnosisBasis'],
    alsoSeeingGp: entry.alsoSeeingGp as ConditionEntryInput['alsoSeeingGp'],
    referredByGp: entry.referredByGp as ConditionEntryInput['referredByGp'],
  }
}

export function toPatientEntryResponse(
  patient: PatientWithConditions,
): PatientEntryResponse {
  return {
    id: patient.id,
    patientType: patient.patientType as PatientEntryResponse['patientType'],
    position: patient.position,
    conditions: patient.conditions.map(toConditionEntryResponse),
  }
}

export function toDailyLogResponse(log: DailyLogWithPatients): DailyLogResponse {
  return {
    id: log.id,
    logDate: log.logDate,
    newPatients: log.newPatients,
    followUpPatients: log.followUpPatients,
    totalPatients: log.newPatients + log.followUpPatients,
    patients: log.patients.map(toPatientEntryResponse),
    createdAt: isoString(log.createdAt),
    updatedAt: isoString(log.updatedAt),
  }
}
