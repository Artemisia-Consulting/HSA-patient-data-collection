/**
 * POST /api/reminders/done-today → 200 reminderStatusResponseSchema | 401
 * Body: none.
 *
 * "Done for today" (FR7). This exists for the day a practitioner saw no
 * patients, and the distinction it protects is a data-quality one:
 *
 *   - A suppressed day writes a DayOverride row. It means "nothing to report".
 *   - A zero-patient day would be a DailyLog with newPatients = 0. It means
 *     "I worked and treated nobody".
 *
 * Those are not the same claim, and the HSA report would be wrong if this
 * button manufactured the second. So it writes a DayOverride and nothing
 * else — there is deliberately no `prisma.dailyLog.create` anywhere in this
 * stream. A practitioner who genuinely wants to record a zero uses Stream 1's
 * log form.
 *
 * Idempotent in effect: the upsert is keyed on (practitionerId, logDate), so
 * a double tap refreshes the timestamp rather than creating a second row or
 * changing the outcome.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { todayInSast } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { resolvePractitioner } from '@/lib/reminders/auth'
import { UNAUTHENTICATED_MESSAGE, jsonError } from '@/lib/reminders/http'
import { buildStatusResponse } from '@/lib/reminders/status'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const practitioner = await resolvePractitioner(request)
  if (!practitioner) {
    return jsonError('UNAUTHENTICATED', UNAUTHENTICATED_MESSAGE)
  }

  const now = new Date()
  const logDate = todayInSast(now)

  await prisma.dayOverride.upsert({
    where: { practitionerId_logDate: { practitionerId: practitioner.id, logDate } },
    create: { practitionerId: practitioner.id, logDate, markedDoneAt: now },
    // Clearing the snooze keeps the two signals from contradicting each other:
    // marking done ends the day, so a pending "remind me in 30 minutes" is
    // stale. The suppression order in schedule.ts would reach MARKED_DONE
    // first regardless; this keeps the stored state honest too.
    update: { markedDoneAt: now, snoozedUntil: null },
  })

  return Response.json(await buildStatusResponse(practitioner, now))
}
