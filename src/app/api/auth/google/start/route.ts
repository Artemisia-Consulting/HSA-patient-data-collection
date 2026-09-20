/**
 * GET /api/auth/google/start — begin "Continue with Google".
 *
 * This exists because Better Auth's own sign-in endpoint is a POST, and the
 * thing that starts the flow is a link on a sign-in page. A plain `<a>` cannot
 * POST, and making it a button would drag a client-side auth library into a
 * bundle that currently has none — for a control whose entire job is to send
 * the browser somewhere else. So: a GET that asks Better Auth for the Google
 * URL and 302s to it.
 *
 * The Set-Cookie headers Better Auth produces are forwarded deliberately. They
 * carry the signed OAuth `state`, which is what stops a third party from
 * feeding us someone else's authorisation code. Dropping them would not look
 * broken — it would look like an intermittent sign-in failure.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { NextResponse } from 'next/server'

import {
  GOOGLE_FINISH_PATH,
  auth,
  authBaseUrl,
  googleSignInConfigured,
} from '@/lib/server/googleAuth'

export const dynamic = 'force-dynamic'

function to(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, authBaseUrl()), 302)
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!googleSignInConfigured) {
    // A 404-ish JSON rather than a redirect: reaching this URL at all means
    // something linked to it that should have been hidden, and a silent bounce
    // back to the sign-in page would hide the misconfiguration.
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message:
            'Google sign-in is not configured on this deployment. Use your personal link from a reminder email.',
        },
      },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const result = await auth.api.signInSocial({
      body: {
        provider: 'google',
        callbackURL: GOOGLE_FINISH_PATH,
        errorCallbackURL: '/signin?google=error',
        // We issue the redirect ourselves so the OAuth state cookies can be
        // attached to it; Better Auth's own redirect would be a 200 with a
        // Location header, which a browser ignores.
        disableRedirect: true,
      },
      headers: request.headers,
      asResponse: true,
    })

    const payload = (await result.json()) as { url?: string }
    if (!payload.url) {
      console.error('[auth] signInSocial returned no URL', result.status)
      return to('/signin?google=error')
    }

    const response = NextResponse.redirect(payload.url, 302)
    for (const cookie of result.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie)
    }
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
    console.error('[auth] could not start Google sign-in', detail)
    return to('/signin?google=error')
  }
}
