/**
 * POST /api/reminders/snooze → 200 reminderStatusResponseSchema | 400 | 401
 * Body: { minutes: 5..360 }
 *
 * "Not now" (FR7, rubric item 8 tier 3). A snooze that lapses before midnight
 * SAST defers the reminder — the dispatcher will still send once it expires.
 * A snooze that runs past midnight settles the day, and the run records
 * SKIPPED/SNOOZED against it.
 *
 * The response is the full status payload rather than an ack, so the phone
 * immediately shows the new `snoozedUntil` and `nextReminderAt` without a
 * second request. The contract fixes the request body and leaves the response
 * unnamed; see docs/streams/reminders.md.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { snoozeRequestSchema } from '@/lib/contract/api'
import { snoozeUntil, todayInSast } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { resolvePractitioner } from '@/lib/reminders/auth'
import {
  UNAUTHENTICATED_MESSAGE,
  jsonError,
  readJsonBody,
  validationError,
} from '@/lib/reminders/http'
import { buildStatusResponse } from '@/lib/reminders/status'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const practitioner = await resolvePractitioner(request)
  if (!practitioner) {
    return jsonError('UNAUTHENTICATED', UNAUTHENTICATED_MESSAGE)
  }

  const parsed = snoozeRequestSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  const now = new Date()
  const logDate = todayInSast(now)
  const until = snoozeUntil(parsed.data.minutes, now)

  // Snoozing must never imply "done" — `markedDoneAt` is left exactly as it
  // was, and no DailyLog row is created.
  await prisma.dayOverride.upsert({
    where: { practitionerId_logDate: { practitionerId: practitioner.id, logDate } },
    create: { practitionerId: practitioner.id, logDate, snoozedUntil: until },
    update: { snoozedUntil: until },
  })

  return Response.json(await buildStatusResponse(practitioner, now))
}
