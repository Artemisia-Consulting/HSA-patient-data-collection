/**
 * GET /api/auth/me — FR1/FR3.
 *
 * Who is calling, what today's date is in SAST, and whether they have already
 * logged. `today` comes from the server so the client never has to trust a
 * device clock that might be days out — a wrong date here would file a day's
 * counts under the wrong date for the whole collection.
 *
 * Accepts a session (bearer or cookie) or `?k=<reminderLinkId>`; arriving with
 * only `k` issues a session cookie on the way out, which is how a reminder
 * link signs you in on a new phone.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { meResponseSchema } from '@/lib/contract'
import { todayInSast } from '@/lib/dates'
import { attachSession, requireAuth } from '@/lib/server/auth'
import { withRoute } from '@/lib/server/errors'
import { jsonResponse } from '@/lib/server/http'
import { hasLoggedOn } from '@/lib/server/logs'
import { toPractitionerResponse } from '@/lib/server/serialise'

export const dynamic = 'force-dynamic'

export const GET = withRoute(async (request: Request): Promise<NextResponse> => {
  const auth = await requireAuth(request)
  const today = todayInSast()

  const response = jsonResponse(meResponseSchema, {
    practitioner: toPractitionerResponse(auth.practitioner),
    today,
    hasLoggedToday: await hasLoggedOn(auth.practitioner.id, today),
  })
  return attachSession(response, auth)
})
