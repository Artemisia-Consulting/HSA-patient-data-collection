/**
 * POST /api/auth/onboarded — FR2.
 *
 * Marks onboarding complete so the first-login explainer is shown once and the
 * practitioner then goes straight to the log form. Idempotent: calling it twice
 * keeps the original timestamp, because "when did they onboard" is a fact about
 * the practitioner, not about the last button press.
 *
 * Returns the same shape as GET /api/auth/me so the client can update its state
 * from one response rather than following up with a second request — there is
 * no separate "onboarding status" endpoint by design (rubric item 12: no
 * redundant endpoints).
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { meResponseSchema } from '@/lib/contract'
import { todayInSast } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { attachSession, requireAuth } from '@/lib/server/auth'
import { withRoute } from '@/lib/server/errors'
import { jsonResponse } from '@/lib/server/http'
import { hasLoggedOn } from '@/lib/server/logs'
import { toPractitionerResponse } from '@/lib/server/serialise'

export const dynamic = 'force-dynamic'

export const POST = withRoute(async (request: Request): Promise<NextResponse> => {
  const auth = await requireAuth(request)

  const practitioner = auth.practitioner.onboardedAt
    ? auth.practitioner
    : await prisma.practitioner.update({
        where: { id: auth.practitioner.id },
        data: { onboardedAt: new Date() },
      })

  const today = todayInSast()
  const response = jsonResponse(meResponseSchema, {
    practitioner: toPractitionerResponse(practitioner),
    today,
    hasLoggedToday: await hasLoggedOn(practitioner.id, today),
  })
  return attachSession(response, auth)
})
