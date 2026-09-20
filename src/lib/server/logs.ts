/**
 * Daily log reads and writes (FR3–FR6).
 *
 * One row per practitioner per calendar day, enforced by the unique index on
 * (practitionerId, logDate) and by upserting rather than inserting — a
 * practitioner who submits twice corrects their day, they do not create a
 * second one.
 *
 * Condition entries are replaced wholesale on each write. They have no
 * client-visible identity between submissions, so reconciling them one by one
 * would buy nothing and risk leaving orphans behind.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import {
  COLLECTION_END_DATE,
  COLLECTION_START_DATE,
  formatLogDateLong,
  isWithinCollectionWindow,
  todayInSast,
} from '@/lib/dates'
import { isOtherCondition, type DailyLogRequest } from '@/lib/contract'
import { prisma } from '@/lib/db'

import { ApiException, validationException } from './errors'
import { lookupConditions } from './taxonomy'
import type { DailyLogWithConditions } from './serialise'

/**
 * A log may only be written for a date inside the collection window, and never
 * for a day that has not happened yet in SAST. Reads are not restricted: a
 * practitioner can always look at what they submitted.
 */
export function assertWritableDate(logDate: string, now: Date = new Date()): void {
  if (!isWithinCollectionWindow(logDate)) {
    throw new ApiException(
      'OUTSIDE_COLLECTION_WINDOW',
      `The collection runs from ${formatLogDateLong(COLLECTION_START_DATE)} to ` +
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
): Promise<DailyLogWithConditions | null> {
  return prisma.dailyLog.findUnique({
    where: { practitionerId_logDate: { practitionerId, logDate } },
    include: { conditions: { orderBy: { createdAt: 'asc' } } },
  })
}

export async function listLogs(
  practitionerId: string,
): Promise<DailyLogWithConditions[]> {
  return prisma.dailyLog.findMany({
    where: { practitionerId },
    include: { conditions: { orderBy: { createdAt: 'asc' } } },
    orderBy: { logDate: 'desc' },
    // The window is 31 days; the cap only matters for pre-launch test rows.
    take: 200,
  })
}

/**
 * Validate condition entries against the live taxonomy table.
 *
 * Zod has already checked the shape; this checks the *meaning*: the code has to
 * exist, still be active, and actually belong to the category the client sent.
 * Free text is dropped for anything that is not an "Other (specify)" row —
 * there is no route by which arbitrary text can be attached to a normal
 * condition, which matters because free text is the one place patient-
 * identifying data could get in (POPIA).
 */
export async function validateConditionEntries(
  entries: DailyLogRequest['conditions'],
): Promise<
  Array<{
    category: string
    conditionCode: string
    conditionOther: string | null
    diagnosisBasis: string
    alsoSeeingGp: string
    referredByGp: string
  }>
> {
  const known = await lookupConditions(entries.map((e) => e.conditionCode))

  return entries.map((entry, index) => {
    const condition = known.get(entry.conditionCode)
    if (!condition) {
      throw validationException(
        `conditions.${index}.conditionCode`,
        'That condition is not on the list',
      )
    }
    if (!condition.isActive) {
      throw validationException(
        `conditions.${index}.conditionCode`,
        'That condition has been retired from the list',
      )
    }
    if (condition.category !== entry.category) {
      throw validationException(
        `conditions.${index}.category`,
        'That condition belongs to a different category',
      )
    }

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
  })
}

export async function upsertLog(
  practitionerId: string,
  logDate: string,
  body: DailyLogRequest,
): Promise<{ log: DailyLogWithConditions; created: boolean }> {
  const conditions = await validateConditionEntries(body.conditions)

  const existing = await prisma.dailyLog.findUnique({
    where: { practitionerId_logDate: { practitionerId, logDate } },
    select: { id: true },
  })

  const log = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.conditionEntry.deleteMany({ where: { dailyLogId: existing.id } })
      await tx.dailyLog.update({
        where: { id: existing.id },
        data: {
          newPatients: body.newPatients,
          followUpPatients: body.followUpPatients,
        },
      })
      if (conditions.length > 0) {
        await tx.conditionEntry.createMany({
          data: conditions.map((c) => ({ ...c, dailyLogId: existing.id })),
        })
      }
      return tx.dailyLog.findUniqueOrThrow({
        where: { id: existing.id },
        include: { conditions: { orderBy: { createdAt: 'asc' } } },
      })
    }

    const created = await tx.dailyLog.create({
      data: {
        practitionerId,
        logDate,
        newPatients: body.newPatients,
        followUpPatients: body.followUpPatients,
        conditions: { create: conditions },
      },
      include: { conditions: { orderBy: { createdAt: 'asc' } } },
    })
    return created
  })

  return { log, created: !existing }
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
