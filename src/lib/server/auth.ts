/**
 * Authentication.
 *
 * Two ways in, checked in the order the contract fixes (see api.ts):
 *
 *   1. `Authorization: Bearer <token>` or the `hsa_session` cookie — how the
 *      PWA stays logged in on-device (FR1).
 *   2. `?k=<reminderLinkId>` — the personalised reminder link, which has to
 *      work on a brand-new phone with no cookie at all (FR1, user story 2.1).
 *      A request that arrives this way is *issued* a session, so following the
 *      link on a new device silently logs the practitioner in.
 *
 * Tokens are 256 bits of CSPRNG output. Only their SHA-256 hash is stored, so
 * a database leak cannot be replayed as a login.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import type { NextResponse } from 'next/server'

import {
  REMINDER_LINK_QUERY_PARAM,
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
} from '@/lib/contract'
import { prisma } from '@/lib/db'
import type { Practitioner } from '@/generated/prisma'

import { ApiException } from './errors'

/** How stale `lastSeenAt` may get before a request bothers to write it. */
const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000

export interface AuthContext {
  practitioner: Practitioner
  /**
   * Set only when this request created a session (arrived with a valid `k` and
   * no usable token). Routes hand it to `attachSession` so the cookie goes out
   * with the response.
   */
  issuedToken?: string
  sessionExpiresAt: Date
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function sessionExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export async function createSession(practitionerId: string): Promise<{
  token: string
  expiresAt: Date
}> {
  const token = generateSessionToken()
  const expiresAt = sessionExpiryFrom()
  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      practitionerId,
      expiresAt,
    },
  })
  return { token, expiresAt }
}

/* ------------------------------------------------------------------ *
 * Request parsing
 * ------------------------------------------------------------------ */

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const name = part.slice(0, index).trim()
    if (!name) continue
    out[name] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (match) return match[1].trim()
  }
  const cookie = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE_NAME]
  return cookie && cookie.length > 0 ? cookie : null
}

export function reminderLinkIdFrom(request: Request): string | null {
  const value = new URL(request.url).searchParams.get(REMINDER_LINK_QUERY_PARAM)
  return value && value.trim().length > 0 ? value.trim() : null
}

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

/**
 * Resolve the caller, or null if the request carries no usable credential.
 *
 * A token that is unknown or expired is not an error on its own: the request
 * falls through to `?k=`, because a practitioner on a new phone may well be
 * carrying a stale cookie from a reinstalled browser profile.
 */
export async function resolveAuth(request: Request): Promise<AuthContext | null> {
  const token = bearerToken(request)
  if (token) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { practitioner: true },
    })
    if (session && session.expiresAt.getTime() > Date.now()) {
      if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS) {
        await prisma.session.update({
          where: { id: session.id },
          data: { lastSeenAt: new Date() },
        })
      }
      return {
        practitioner: session.practitioner,
        sessionExpiresAt: session.expiresAt,
      }
    }
  }

  const reminderLinkId = reminderLinkIdFrom(request)
  if (reminderLinkId) {
    const practitioner = await prisma.practitioner.findUnique({
      where: { reminderLinkId },
    })
    if (practitioner) {
      const { token: issuedToken, expiresAt } = await createSession(practitioner.id)
      return { practitioner, issuedToken, sessionExpiresAt: expiresAt }
    }
  }

  return null
}

export async function requireAuth(request: Request): Promise<AuthContext> {
  const auth = await resolveAuth(request)
  if (!auth) {
    throw new ApiException(
      'UNAUTHENTICATED',
      'Please sign in again, or open your personal link from your reminder.',
    )
  }
  return auth
}

/** Researcher dashboard gate (FR8, rubric item 14 tier 3). */
export async function requireResearcher(request: Request): Promise<AuthContext> {
  const auth = await requireAuth(request)
  if (auth.practitioner.role !== 'RESEARCHER') {
    throw new ApiException(
      'FORBIDDEN',
      'This area is for the HSA research team only.',
    )
  }
  return auth
}

/* ------------------------------------------------------------------ *
 * Cookie
 * ------------------------------------------------------------------ */

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
  return response
}

/**
 * Attach the session cookie when this request issued one. Routes call this on
 * their way out so that arriving via `?k=` leaves the device logged in.
 */
export function attachSession(response: NextResponse, auth: AuthContext): NextResponse {
  if (auth.issuedToken) {
    setSessionCookie(response, auth.issuedToken, auth.sessionExpiresAt)
  }
  return response
}

/**
 * Constant-time compare for shared secrets (CRON_SECRET and friends).
 * Exported here so Stream 3 does not have to re-roll it.
 */
export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
