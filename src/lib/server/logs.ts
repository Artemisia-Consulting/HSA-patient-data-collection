/**
 * Daily log reads and writes (FR3–FR6).
 *
 * One row per practitioner per calendar day, enforced by the unique index on
 * (practitionerId, logDate) and by upserting rather than inserting — a
 * practitioner who submits twice corrects their day, they do not create a
 * second one.
 *
 * Patients and their condition entries are replaced wholesale on each write.
 * They have no client-visible identity between submissions, so reconciling them
 * one by one would buy nothing and risk leaving orphans behind.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import {
  COLLECTION_END_DATE,
  EARLY_ENTRY_FROM_DATE,
  formatLogDateLong,
  isWritableLogDate,
  todayInSast,
} from '@/lib/dates'
import {
  isOtherCondition,
  type ConditionEntryInput,
  type DailyLogRequest,
  type PatientEntryInput,
} from '@/lib/contract'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma'

import { ApiException, validationException } from './errors'
import { lookupConditions } from './taxonomy'
import { LOG_PATIENT_INCLUDE, type DailyLogWithPatients } from './serialise'

/**
 * A log may only be written for a writable date, and never for a day that has
 * not happened yet in SAST. Reads are not restricted: a practitioner can
 * always look at what they submitted.
 *
 * Writable is wider than the collection window — days before 1 October are
 * accepted so the app can be used before the study opens — but those days are
 * not part of the research. See `isWritableLogDate`.
 */
export function assertWritableDate(logDate: string, now: Date = new Date()): void {
  if (!isWritableLogDate(logDate)) {
    throw new ApiException(
      'OUTSIDE_COLLECTION_WINDOW',
      `Entries can be logged from ${formatLogDateLong(EARLY_ENTRY_FROM_DATE)} to ` +
        `${formatLogDateLong(COLLECTION_END_DATE)}. You can't log for ` +
        `${formatLogDateLong(logDate)}.`,
      { logDate: ['Date is outside the collection window'] },
    )
  }
  if (logDate > todayInSast(now)) {
    throw new ApiException(
      'OUTSIDE_COLLECTION_WINDOW',
      "You can't log a day that hasn't happened yet.",
      { logDate: ['Date is in the future'] },
    )
  }
}

export async function getLog(
  practitionerId: string,
  logDate: string,
): Promise<DailyLogWithPatients | null> {
  return prisma.dailyLog.findUnique({
    where: { practitionerId_logDate: { practitionerId, logDate } },
    include: LOG_PATIENT_INCLUDE,
  })
}

export async function listLogs(
  practitionerId: string,
): Promise<DailyLogWithPatients[]> {
  return prisma.dailyLog.findMany({
    where: { practitionerId },
    include: LOG_PATIENT_INCLUDE,
    orderBy: { logDate: 'desc' },
    // The window is 31 days; the cap only matters for pre-launch test rows.
    take: 200,
  })
}

/**
 * Validate a day's patients against the live taxonomy table.
 *
 * Zod has already checked the shape; this checks the *meaning*: each condition
 * code has to exist, still be active, and actually belong to the category the
 * client sent. Free text is dropped for anything that is not an
 * "Other (specify)" row — there is no route by which arbitrary text can be
 * attached to a normal condition, which matters because free text is the one
 * place patient-identifying data could get in (POPIA).
 *
 * Field errors carry their full path (`patients.2.conditions.0.conditionCode`)
 * so the form can mark the offending control on the right patient card rather
 * than just somewhere in the day.
 */
type ValidatedCondition = {
  category: string
  conditionCode: string
  conditionOther: string | null
  diagnosisBasis: string
  alsoSeeingGp: string
  referredByGp: string
}

type ValidatedPatient = {
  patientType: string
  position: number
  conditions: ValidatedCondition[]
}

export async function validatePatientEntries(
  patients: PatientEntryInput[],
): Promise<ValidatedPatient[]> {
  const known = await lookupConditions(
    patients.flatMap((patient) => patient.conditions.map((e) => e.conditionCode)),
  )

  // Positions run 1..n *within a type*, so "new patient 3" keeps meaning the
  // third card under New however the two lists are interleaved in the payload.
  const nextPosition = new Map<string, number>()

  return patients.map((patient, patientIndex) => {
    const position = (nextPosition.get(patient.patientType) ?? 0) + 1
    nextPosition.set(patient.patientType, position)

    return {
      patientType: patient.patientType,
      position,
      conditions: patient.conditions.map((entry, entryIndex) => {
        const path = `patients.${patientIndex}.conditions.${entryIndex}`
        const condition = known.get(entry.conditionCode)
        if (!condition) {
          throw validationException(
            `${path}.conditionCode`,
            'That condition is not on the list',
          )
        }
        if (!condition.isActive) {
          throw validationException(
            `${path}.conditionCode`,
            'That condition has been retired from the list',
          )
        }
        if (condition.category !== entry.category) {
          throw validationException(
            `${path}.category`,
            'That condition belongs to a different category',
          )
        }
        return toValidatedCondition(entry)
      }),
    }
  })
}

function toValidatedCondition(entry: ConditionEntryInput): ValidatedCondition {
  return {
    category: entry.category,
    conditionCode: entry.conditionCode,
    conditionOther: isOtherCondition(entry.conditionCode)
      ? (entry.conditionOther ?? null)
      : null,
    diagnosisBasis: entry.diagnosisBasis,
    alsoSeeingGp: entry.alsoSeeingGp,
    referredByGp: entry.referredByGp,
  }
}

export async function upsertLog(
  practitionerId: string,
  logDate: string,
  body: DailyLogRequest,
): Promise<{ log: DailyLogWithPatients; created: boolean }> {
  const patients = await validatePatientEntries(body.patients)

  const existing = await prisma.dailyLog.findUnique({
    where: { practitionerId_logDate: { practitionerId, logDate } },
    select: { id: true },
  })

  const log = await prisma.$transaction(async (tx) => {
    if (existing) {
      // Deleting the patients takes their conditions with them (onDelete:
      // Cascade), so a corrected day cannot leave the previous version's
      // entries behind.
      await tx.patientEntry.deleteMany({ where: { dailyLogId: existing.id } })
      await tx.dailyLog.update({
        where: { id: existing.id },
        data: {
          newPatients: body.newPatients,
          followUpPatients: body.followUpPatients,
        },
      })
      await createPatients(tx, existing.id, patients)
      return tx.dailyLog.findUniqueOrThrow({
        where: { id: existing.id },
        include: LOG_PATIENT_INCLUDE,
      })
    }

    return tx.dailyLog.create({
      data: {
        practitionerId,
        logDate,
        newPatients: body.newPatients,
        followUpPatients: body.followUpPatients,
        patients: {
          create: patients.map((patient) => ({
            patientType: patient.patientType,
            position: patient.position,
            conditions: { create: patient.conditions },
          })),
        },
      },
      include: LOG_PATIENT_INCLUDE,
    })
  })

  return { log, created: !existing }
}

/**
 * `createMany` cannot create the nested conditions, so each patient is its own
 * insert. A day is a few dozen patients at most and this runs inside the
 * transaction, so the extra round trips are not worth avoiding with raw SQL.
 */
async function createPatients(
  tx: Prisma.TransactionClient,
  dailyLogId: string,
  patients: ValidatedPatient[],
): Promise<void> {
  for (const patient of patients) {
    await tx.patientEntry.create({
      data: {
        dailyLogId,
        patientType: patient.patientType,
        position: patient.position,
        conditions: { create: patient.conditions },
      },
    })
  }
}

/* ------------------------------------------------------------------ *
 * Cross-stream helpers
 *
 * Stream 3's reminder scheduler must not query `prisma.dailyLog` directly
 * (docs/OWNERSHIP.md) — it calls these instead, so "has this practitioner
 * logged today?" has one definition in the codebase.
 * ------------------------------------------------------------------ */

/** Has this practitioner submitted a log for the given SAST date? */
export async function hasLoggedOn(
  practitionerId: string,
  logDate: string,
): Promise<boolean> {
  const count = await prisma.dailyLog.count({
    where: { practitionerId, logDate },
  })
  return count > 0
}

export async function hasLoggedToday(
  practitionerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return hasLoggedOn(practitionerId, todayInSast(now))
}

/**
 * The set of practitioners who already logged on a date — one query for the
 * whole dispatch run rather than one per practitioner.
 */
export async function practitionerIdsWithLogOn(logDate: string): Promise<Set<string>> {
  const rows = await prisma.dailyLog.findMany({
    where: { logDate },
    select: { practitionerId: true },
  })
  return new Set(rows.map((row) => row.practitionerId))
}
