/**
 * Better Auth's own endpoints, mounted at /api/oauth/*.
 *
 * Not /api/auth/*: that prefix already holds this app's hand-written routes
 * (signup, resume, me, signout, researcher), and a catch-all there would
 * swallow every one of them. See src/lib/server/googleAuth.ts.
 *
 * The only URL under here a human ever visits is the Google callback,
 * /api/oauth/callback/google — the one that must be registered in the Google
 * Cloud console.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { toNextJsHandler } from 'better-auth/next-js'

import { auth } from '@/lib/server/googleAuth'

export const dynamic = 'force-dynamic'

export const { GET, POST } = toNextJsHandler(auth)
