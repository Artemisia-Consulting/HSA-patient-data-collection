/**
 * POST /api/auth/researcher — researcher sign-in via a shared code.
 *
 * This is a development stopgap, kept deliberately simple. Practitioners sign
 * in with Google (see `src/lib/server/googleAuth.ts`); the HSA research team
 * uses a shared code until they are issued proper accounts.
 *
 * "Temporary" is not a reason to ship it open, so three things are enforced:
 *
 *  - In production the route refuses to run unless RESEARCHER_CODE is set,
 *    exactly as the dispatch route refuses without CRON_SECRET. It previously
 *    fell back to a default that was committed to the repository, which meant
 *    anyone who read the source could export the whole dataset.
 *  - The comparison is constant-time. A plain `!==` leaks the code prefix by
 *    prefix to anyone who can measure the response.
 *  - It is rate limited like the other unauthenticated routes, so the code
 *    cannot simply be guessed at speed.
 *
 * OWNERSHIP: Integration lead.
 */
import { type NextResponse } from 'next/server'
import { z } from 'zod'

import { authSessionResponseSchema } from '@/lib/contract'
import { prisma } from '@/lib/db'
import { attachSession, createSession, safeCompare } from '@/lib/server/auth'
import { errorResponse, readJsonBody, validationError, withRoute } from '@/lib/server/errors'
import { clientIp, jsonResponse } from '@/lib/server/http'
import { RATE_LIMITS, consumeRateLimit } from '@/lib/server/rateLimit'
import { toAuthSessionResponse } from '@/lib/server/serialise'

export const dynamic = 'force-dynamic'

/** Dev-only convenience value. Never reachable when NODE_ENV is production. */
const DEV_FALLBACK_CODE = 'hsa-dev-researcher'

const researcherCodeSchema = z.object({
  code: z.string().min(1, 'Enter the researcher code'),
})

/** The expected code, or null when this deployment has not configured one. */
function expectedCode(): string | null {
  const configured = process.env.RESEARCHER_CODE?.trim()
  if (configured) return configured
  return process.env.NODE_ENV === 'production' ? null : DEV_FALLBACK_CODE
}

export const POST = withRoute(async (request: Request): Promise<NextResponse> => {
  const limit = consumeRateLimit(
    `researcher:${clientIp(request)}`,
    RATE_LIMITS.researcher.limit,
    RATE_LIMITS.researcher.windowMs,
  )
  if (!limit.allowed) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Please try again shortly.')
  }

  const expected = expectedCode()
  if (!expected) {
    console.error('[auth] RESEARCHER_CODE is not set; refusing researcher sign-in')
    return errorResponse(
      'FORBIDDEN',
      'Researcher sign-in is not configured on this deployment.',
    )
  }

  const parsed = researcherCodeSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return validationError(parsed.error)

  if (!safeCompare(parsed.data.code, expected)) {
    return errorResponse('FORBIDDEN', 'That code is not recognised.', {
      code: ['Incorrect researcher code'],
    })
  }

  // Oldest researcher, deterministically. `findFirst` with no ordering picked an
  // arbitrary row, so with two researcher accounts the identity you got back
  // depended on storage order.
  const researcher = await prisma.practitioner.findFirst({
    where: { role: 'RESEARCHER' },
    orderBy: { createdAt: 'asc' },
  })

  if (!researcher) {
    return errorResponse(
      'NOT_FOUND',
      'No researcher account exists on this deployment yet.',
    )
  }

  const { token, expiresAt } = await createSession(researcher.id)

  const response = jsonResponse(
    authSessionResponseSchema,
    toAuthSessionResponse(researcher, token, expiresAt),
  )

  return attachSession(response, {
    practitioner: researcher,
    issuedToken: token,
    sessionExpiresAt: expiresAt,
  })
})
