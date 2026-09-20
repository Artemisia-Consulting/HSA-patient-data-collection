/**
 * POST /api/auth/resume — FR1, user story 2.1.
 *
 * Authenticates by `reminderLinkId` alone and issues a fresh session. This is
 * what makes a reminder link work on a brand-new phone with no cookie: the
 * client posts the id out of the URL and gets a session back.
 *
 * The id is an unguessable cuid and is therefore a credential — hence the rate
 * limit, and hence answering 401 rather than 404 for an unknown one, which
 * would otherwise turn this route into an oracle for valid ids.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { authSessionResponseSchema, resumeRequestSchema } from '@/lib/contract'
import { prisma } from '@/lib/db'
import { attachSession, createSession } from '@/lib/server/auth'
import { errorResponse, readJsonBody, validationError, withRoute } from '@/lib/server/errors'
import { clientIp, jsonResponse } from '@/lib/server/http'
import { RATE_LIMITS, consumeRateLimit } from '@/lib/server/rateLimit'
import { toAuthSessionResponse } from '@/lib/server/serialise'

export const dynamic = 'force-dynamic'

export const POST = withRoute(async (request: Request): Promise<NextResponse> => {
  const limit = consumeRateLimit(
    `resume:${clientIp(request)}`,
    RATE_LIMITS.resume.limit,
    RATE_LIMITS.resume.windowMs,
  )
  if (!limit.allowed) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Please try again shortly.')
  }

  const parsed = resumeRequestSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return validationError(parsed.error)

  const practitioner = await prisma.practitioner.findUnique({
    where: { reminderLinkId: parsed.data.reminderLinkId },
  })
  if (!practitioner) {
    return errorResponse(
      'UNAUTHENTICATED',
      'That link is not valid any more. Please sign up again with your email address.',
    )
  }

  const session = await createSession(practitioner.id)
  const response = jsonResponse(
    authSessionResponseSchema,
    toAuthSessionResponse(practitioner, session.token, session.expiresAt),
  )
  return attachSession(response, {
    practitioner,
    issuedToken: session.token,
    sessionExpiresAt: session.expiresAt,
  })
})
