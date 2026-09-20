/**
 * Google sign-in, via Better Auth.
 *
 * WHY THIS IS A SEPARATE AUTH STACK
 *
 * The app already has an authentication system (src/lib/server/auth.ts): a
 * bearer token in an httpOnly cookie, plus the `?k=` reminder link. Nothing
 * about that changes here. Better Auth is used for one narrow job — asking
 * Google "does this person really own this email address?" — and the answer is
 * then exchanged for one of *our* sessions. Two consequences worth stating:
 *
 *  1. Every existing route, test and offline path keeps working untouched.
 *     Google is an extra front door, not a replacement lock.
 *  2. Removing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET switches the whole
 *     thing off cleanly: the button disappears, the start route refuses, and
 *     the app behaves exactly as it did before.
 *
 * MOUNT POINT. Better Auth is mounted at /api/oauth, not the conventional
 * /api/auth, because /api/auth/* is already occupied by this app's own static
 * routes (signup, resume, me, signout…). A catch-all there would shadow them.
 *
 * POPIA. Nothing stored by Better Auth is patient data — it is the
 * practitioner's own Google profile. Like Practitioner.email it is personal
 * information about the practitioner, and like Practitioner.email it must
 * never appear in a dashboard response or a CSV export.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { randomBytes } from 'node:crypto'

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'

import { OAUTH_BASE_PATH } from '@/lib/contract'
import { prisma } from '@/lib/db'

import { appUrl } from './http'

// The paths live in the contract, not here: a sign-in button needs to link to
// them, and importing this module from a component would drag Prisma and
// Better Auth into the browser bundle.
export { GOOGLE_FINISH_PATH, GOOGLE_START_PATH, OAUTH_BASE_PATH } from '@/lib/contract'

/**
 * The origin Google is told to come back to.
 *
 * NEXT_PUBLIC_APP_URL is inlined at *build* time, like every NEXT_PUBLIC_ var,
 * so a deployment that sets it only as a runtime variable would send Google to
 * whatever was baked in — and Better Auth would then reject the callback as a
 * foreign origin. BETTER_AUTH_URL is read at runtime and wins when set, which
 * makes that recoverable without a rebuild.
 */
export function authBaseUrl(): string {
  const runtime = process.env.BETTER_AUTH_URL?.trim()
  return runtime && runtime.length > 0 ? runtime.replace(/\/+$/, '') : appUrl()
}

/**
 * The exact URI that must be listed as an "Authorised redirect URI" in the
 * Google Cloud console. Exported so the setup notes cannot drift from the code.
 */
export function googleRedirectUri(): string {
  return `${authBaseUrl()}${OAUTH_BASE_PATH}/callback/google`
}

const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? ''
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? ''
const configuredSecret = process.env.BETTER_AUTH_SECRET?.trim() ?? ''
const isProduction = process.env.NODE_ENV === 'production'

/**
 * A weak, well-known secret is worse than no Google sign-in at all: it signs
 * the OAuth state that protects the whole flow. So in production a missing
 * BETTER_AUTH_SECRET disables the feature rather than falling back — the
 * button hides and the start route refuses, which is visible and fixable,
 * where a silent weak key would not be.
 */
const secret =
  configuredSecret || (isProduction ? '' : 'hsa-development-only-better-auth-secret')

/** True when Google sign-in can actually be offered. Checked by the UI too. */
export const googleSignInConfigured =
  clientId.length > 0 && clientSecret.length > 0 && secret.length > 0

if (clientId.length > 0 && clientSecret.length > 0 && secret.length === 0) {
  console.warn(
    '[auth] GOOGLE_CLIENT_ID/SECRET are set but BETTER_AUTH_SECRET is not. ' +
      'Google sign-in is disabled until it is.',
  )
}

/** SQLite locally, Postgres in production — inferred rather than configured twice. */
function prismaProvider(): 'sqlite' | 'postgresql' {
  const url = process.env.DATABASE_URL ?? ''
  return url.startsWith('postgres') ? 'postgresql' : 'sqlite'
}

/**
 * `modelName` must be the *Prisma client accessor*, not the Prisma model name:
 * the adapter resolves a model by `db[modelName]`, so `AuthUser` in the schema
 * is `authUser` here. Getting this wrong fails at runtime, not at compile time.
 */
export const auth = betterAuth({
  appName: 'HSA Daily Patient Log',
  basePath: OAUTH_BASE_PATH,
  baseURL: authBaseUrl(),
  // When the feature is off this instance is never reached, but Better Auth
  // still wants a secret at construction time. A per-process random one keeps
  // it quiet without putting a weak constant anywhere near a real deployment.
  secret: secret || randomBytes(32).toString('base64'),
  database: prismaAdapter(prisma, { provider: prismaProvider() }),
  user: { modelName: 'authUser' },
  session: {
    modelName: 'authSession',
    // Minutes, not days. This session exists only to carry the caller from
    // Google's redirect to the handoff route; the app's own 120-day session
    // takes over from there.
    expiresIn: 30 * 60,
    updateAge: 30 * 60,
  },
  account: { modelName: 'authAccount' },
  verification: { modelName: 'authVerification' },
  advanced: {
    // Keeps Better Auth's cookies visibly distinct from `hsa_session`.
    cookiePrefix: 'hsa_oauth',
  },
  emailAndPassword: { enabled: false },
  socialProviders: googleSignInConfigured
    ? {
        google: {
          clientId,
          clientSecret,
          redirectURI: googleRedirectUri(),
        },
      }
    : {},
})

/**
 * The verified Google identity on this request, or null.
 *
 * `emailVerified` is insisted on rather than assumed: it is the only thing
 * that makes an email address evidence of identity, which is the entire
 * premise of signing in this way.
 */
export async function googleIdentity(
  request: Request,
): Promise<{ email: string; name: string } | null> {
  if (!googleSignInConfigured) return null
  const result = await auth.api.getSession({ headers: request.headers })
  const user = result?.user
  if (!user?.email || !user.emailVerified) return null
  return { email: user.email.trim().toLowerCase(), name: user.name?.trim() || '' }
}
