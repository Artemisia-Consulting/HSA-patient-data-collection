/* ------------------------------------------------------------------ *
 * CROSS-STREAM SEAM — REPLACE AT INTEGRATION
 * ------------------------------------------------------------------ *
 *
 * Stream 3 needs exactly one fact from Stream 1's territory: does a DailyLog
 * row exist for this practitioner on this SAST date? Nothing else. Not the
 * counts, not the conditions, not the diagnosis basis.
 *
 * Stream 1 owns the log endpoints and `src/lib/server/**`, and was building
 * them at the same time as this, so the helper does not exist yet. Rather
 * than scatter `prisma.dailyLog` calls through the scheduler, every read of
 * that table in Stream 3 goes through the two functions below — this file is
 * the only place in `src/lib/reminders/**` and `src/app/api/reminders/**`
 * that names `dailyLog` at all.
 *
 * TO INTEGRATE: replace the two function bodies with calls into Stream 1's
 * helper (something like `hasLoggedOn` / `logDatesFor` in
 * `src/lib/server/logs.ts`). The signatures below are the whole contract; no
 * caller changes. `grep -rn "dailyLog" src/lib/reminders src/app/api/reminders`
 * should return this file and nothing else, before or after.
 *
 * POPIA: both queries select `practitionerId` only. Widening the `select` here
 * would pull clinical data into the reminder layer, which is exactly what the
 * brief forbids.
 *
 * OWNERSHIP: Stream 3 (reminders), pending replacement by Stream 1's helper.
 * ------------------------------------------------------------------ */
import { prisma } from '../db'

/** Does a log exist for this practitioner on this SAST "yyyy-MM-dd" date? */
export async function hasLoggedOn(
  practitionerId: string,
  logDate: string,
): Promise<boolean> {
  const row = await prisma.dailyLog.findUnique({
    where: { practitionerId_logDate: { practitionerId, logDate } },
    select: { practitionerId: true },
  })
  return row !== null
}

/**
 * Batched form for a dispatch run: one query for the whole cohort instead of
 * one per practitioner. Returns the subset of ids that have logged.
 */
export async function practitionersWhoLoggedOn(
  practitionerIds: string[],
  logDate: string,
): Promise<Set<string>> {
  if (practitionerIds.length === 0) return new Set()

  const rows = await prisma.dailyLog.findMany({
    where: { logDate, practitionerId: { in: practitionerIds } },
    select: { practitionerId: true },
  })
  return new Set(rows.map((row) => row.practitionerId))
}
