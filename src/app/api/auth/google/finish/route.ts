/**
 * GET /api/auth/google/finish — Google has vouched for an email; turn that
 * into one of this app's own sessions.
 *
 * This is the whole point of the integration, and the interesting decision is
 * what happens when the verified address is NOT a registered practitioner.
 * It does not create one. Signing up is the consent event for the study
 * (see SignupForm and the privacy note), so an account created silently by an
 * OAuth callback would be a participant with no consent record — exactly the
 * thing POPIA compliance here rests on. Instead the caller is sent to /signup,
 * where the form reads the same Google session server-side and pre-fills the
 * name and email, leaving the consent tick to be made by a human.
 *
 * On success the Better Auth session is revoked immediately: it was a courier,
 * and it has delivered.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { createSession, setSessionCookie } from '@/lib/server/auth'
import {
  auth,
  authBaseUrl,
  googleIdentity,
  googleSignInConfigured,
} from '@/lib/server/googleAuth'

export const dynamic = 'force-dynamic'

function to(path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, authBaseUrl()), 303)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!googleSignInConfigured) return to('/signin?google=unavailable')

  let identity: Awaited<ReturnType<typeof googleIdentity>> = null
  try {
    identity = await googleIdentity(request)
  } catch (error) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
    console.error('[auth] could not read the Google session', detail)
    return to('/signin?google=error')
  }

  // No session, or Google did not confirm the address is actually theirs.
  if (!identity) return to('/signin?google=unverified')

  const practitioner = await prisma.practitioner.findUnique({
    where: { email: identity.email },
  })

  // Verified, but not a participant. Consent, not an OAuth callback, is what
  // makes someone one.
  if (!practitioner) return to('/signup?google=new')

  const { token, expiresAt } = await createSession(practitioner.id)
  // Same gate as the entry router: walkthrough first, then the one-off
  // reminder question (FR7), then the log.
  const response = to(
    !practitioner.onboardedAt
      ? '/welcome'
      : !practitioner.reminderChoiceAt
        ? '/reminders?setup=1'
        : '/log',
  )
  setSessionCookie(response, token, expiresAt)

  // Best-effort: the app's session is the one that matters from here, and a
  // failure to tidy up must not strand a practitioner who has just signed in.
  try {
    const signedOut = await auth.api.signOut({
      headers: request.headers,
      asResponse: true,
    })
    for (const cookie of signedOut.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie)
    }
  } catch {
    // The Better Auth session expires on its own within 30 minutes.
  }

  return response
}
