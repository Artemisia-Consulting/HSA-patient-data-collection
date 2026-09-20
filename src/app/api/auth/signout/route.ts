/**
 * POST /api/auth/signout — end the session on this device.
 *
 * Signing out has to do three things, and the previous client-only version did
 * none of them:
 *
 *  1. Delete the `Session` row. Until that happens the bearer token is still a
 *     valid credential for its full 120-day TTL, so "sign out" on a shared
 *     practice phone left a working key behind.
 *  2. Clear the `hsa_session` cookie. It is httpOnly, so `document.cookie`
 *     cannot touch it — only a Set-Cookie from here can.
 *  3. Succeed even when the caller has no usable session, so a half-signed-out
 *     device can always finish the job rather than being stuck on a 401.
 *
 * The `?k=` reminder link is deliberately NOT honoured here: resolving it would
 * mint a brand-new session on the way to destroying one.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { NextResponse } from 'next/server'

import { SESSION_COOKIE_NAME } from '@/lib/contract'
import { prisma } from '@/lib/db'
import { bearerToken, hashSessionToken } from '@/lib/server/auth'
import { withRoute } from '@/lib/server/errors'
import { NO_STORE } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

export const POST = withRoute(async (request: Request): Promise<NextResponse> => {
  const token = bearerToken(request)

  if (token) {
    // deleteMany, not delete: an already-deleted or unknown token must not turn
    // a sign-out into a 500. Idempotent by construction.
    await prisma.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    })
  }

  const response = NextResponse.json({ signedOut: true }, { headers: NO_STORE })
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
})
