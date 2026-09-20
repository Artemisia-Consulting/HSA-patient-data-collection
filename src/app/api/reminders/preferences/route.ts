/**
 * GET  /api/reminders/preferences → 200 reminderStatusResponseSchema | 401
 * PUT  /api/reminders/preferences → 200 reminderStatusResponseSchema | 400 | 401
 *
 * The opt-in itself (FR7): channel, time, Saturday toggle. Both verbs return
 * the same status payload so the client never needs a second round trip to
 * refresh `nextReminderAt` after saving — which matters on the bad mobile
 * connections the brief calls out.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { reminderPreferencesSchema } from '@/lib/contract/api'
import { resolvePractitioner } from '@/lib/reminders/auth'
import {
  UNAUTHENTICATED_MESSAGE,
  jsonError,
  readJsonBody,
  validationError,
} from '@/lib/reminders/http'
import { buildStatusResponse } from '@/lib/reminders/status'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const practitioner = await resolvePractitioner(request)
  if (!practitioner) {
    return jsonError('UNAUTHENTICATED', UNAUTHENTICATED_MESSAGE)
  }

  return Response.json(await buildStatusResponse(practitioner))
}

export async function PUT(request: Request): Promise<Response> {
  const practitioner = await resolvePractitioner(request)
  if (!practitioner) {
    return jsonError('UNAUTHENTICATED', UNAUTHENTICATED_MESSAGE)
  }

  const parsed = reminderPreferencesSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  const { channel, time, includeSaturday, whatsappNumber } = parsed.data
  const optingIn = channel !== 'NONE'
  const wasOptedIn = practitioner.reminderChannel !== 'NONE'

  // `reminderOptInAt` answers "is this person opted in, and since when?".
  // Stamp it on the transition into reminders, clear it on the way out, and
  // leave it untouched when someone merely changes their time or channel.
  let optInAt: Date | null | undefined
  if (optingIn && !wasOptedIn) optInAt = new Date()
  else if (!optingIn) optInAt = null

  const updated = await prisma.practitioner.update({
    where: { id: practitioner.id },
    data: {
      reminderChannel: channel,
      reminderTime: time,
      reminderIncludeSat: includeSaturday,
      // Keep the number when switching to email so turning WhatsApp back on
      // does not mean retyping it; drop it when reminders are turned off.
      whatsappNumber: optingIn
        ? (whatsappNumber ?? practitioner.whatsappNumber)
        : null,
      ...(optInAt === undefined ? {} : { reminderOptInAt: optInAt }),
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      reminderLinkId: true,
      reminderChannel: true,
      reminderTime: true,
      reminderIncludeSat: true,
      whatsappNumber: true,
    },
  })

  return Response.json(await buildStatusResponse(updated))
}
