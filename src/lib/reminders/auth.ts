/* ------------------------------------------------------------------ *
 * CROSS-STREAM SEAM — REPLACE AT INTEGRATION
 * ------------------------------------------------------------------ *
 *
 * Stream 1 owns authentication and `src/lib/server/**`, which did not exist
 * while this stream was built. The reminder routes still have to identify the
 * caller, so this is a minimal local resolver implementing exactly the order
 * the locked contract specifies in `src/lib/contract/api.ts`:
 *
 *   1. `Authorization: Bearer <sessionToken>`, or the `hsa_session` cookie.
 *   2. `?k=<reminderLinkId>` — the personalised reminder link, which must work
 *      on a brand-new device with no cookie at all.
 *
 * TO INTEGRATE: replace `resolvePractitioner` with Stream 1's helper. It is
 * called from four route files and nothing else.
 *
 * Deliberately NOT done here: minting a session cookie for a `?k=` arrival.
 * The contract assigns that to Stream 1 (`POST /api/auth/resume`), and two
 * streams both issuing sessions would be two places to get session security
 * wrong. A `?k=` caller is identified for the duration of the request only.
 *
 * Assumption to verify at integration: `Session.tokenHash` is the lowercase
 * hex SHA-256 of the raw bearer token. The schema comment says "SHA-256 of the
 * bearer token" without pinning the encoding; if Stream 1 chose base64, this
 * resolver silently fails to match and every session-authenticated reminder
 * request 401s. Swapping in their helper removes the assumption entirely.
 *
 * OWNERSHIP: Stream 3 (reminders), pending replacement by Stream 1's helper.
 * ------------------------------------------------------------------ */
import { createHash } from 'node:crypto'

import { REMINDER_LINK_QUERY_PARAM, SESSION_COOKIE_NAME } from '../contract/api'
import { prisma } from '../db'

export interface AuthedPractitioner {
  id: string
  email: string
  fullName: string
  reminderLinkId: string
  reminderChannel: string
  reminderTime: string
  reminderIncludeSat: boolean
  whatsappNumber: string | null
}

const PRACTITIONER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  reminderLinkId: true,
  reminderChannel: true,
  reminderTime: true,
  reminderIncludeSat: true,
  whatsappNumber: true,
} as const

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

/** Minimal Cookie-header parse; avoids depending on a Next request API shape. */
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim())
    }
  }
  return null
}

function readBearer(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

export async function resolvePractitioner(
  request: Request,
): Promise<AuthedPractitioner | null> {
  const token = readBearer(request) ?? readCookie(request, SESSION_COOKIE_NAME)

  if (token) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: { expiresAt: true, practitioner: { select: PRACTITIONER_SELECT } },
    })
    if (session && session.expiresAt.getTime() > Date.now()) {
      return session.practitioner
    }
  }

  const linkId = new URL(request.url).searchParams.get(REMINDER_LINK_QUERY_PARAM)
  if (linkId) {
    const practitioner = await prisma.practitioner.findUnique({
      where: { reminderLinkId: linkId },
      select: PRACTITIONER_SELECT,
    })
    if (practitioner) return practitioner
  }

  return null
}
