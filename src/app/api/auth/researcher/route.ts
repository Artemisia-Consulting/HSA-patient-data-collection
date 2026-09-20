/**
 * POST /api/auth/researcher — quick researcher auth via a shared code.
 *
 * This is a stopgap: the real researcher auth will be proper SSO or invite
 * tokens before go-live. For now, the HSA team uses a shared code
 * (RESEARCHER_CODE env var, default "HSA4Life123") to access the dashboard.
 *
 * The endpoint looks up the first practitioner with role=RESEARCHER and
 * creates a session for them. No new account is created.
 *
 * OWNERSHIP: Integration lead (post-merge addition).
 */
import { type NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { attachSession, createSession } from '@/lib/server/auth'
import { ApiException, withRoute } from '@/lib/server/errors'
import { jsonResponse } from '@/lib/server/http'
import { toAuthSessionResponse } from '@/lib/server/serialise'
import { authSessionResponseSchema } from '@/lib/contract'

const RESEARCHER_CODE = process.env.RESEARCHER_CODE ?? 'HSA4Life123'

export const dynamic = 'force-dynamic'

const researcherSignupRequestSchema = {
  parse: (body: unknown) => {
    if (typeof body !== 'object' || body === null) {
      throw new ApiException('VALIDATION_FAILED', 'Invalid request')
    }
    const { code } = body as { code?: unknown }
    if (typeof code !== 'string' || code.length === 0) {
      throw new ApiException('VALIDATION_FAILED', 'Code is required')
    }
    return { code }
  },
}

export const POST = withRoute(async (request: Request): Promise<NextResponse> => {
  const body = await request.json().catch(() => {
    throw new ApiException('VALIDATION_FAILED', 'Invalid JSON')
  })
  const { code } = researcherSignupRequestSchema.parse(body)

  if (code !== RESEARCHER_CODE) {
    throw new ApiException('FORBIDDEN', 'Invalid researcher code')
  }

  const researcher = await prisma.practitioner.findFirst({
    where: { role: 'RESEARCHER' },
  })

  if (!researcher) {
    throw new ApiException('NOT_FOUND', 'No researcher account exists')
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
