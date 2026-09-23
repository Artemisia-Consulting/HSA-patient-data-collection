/**
 * Signup (FR1). See `SignupForm` for why the consent tick is the consent
 * record and how the duplicate-email path recovers.
 *
 * GOOGLE. Arriving here from the Google flow (`?google=new`) means Google
 * verified an email address that is not a registered practitioner. That is
 * deliberately not enough to create one — consent is — so the address and name
 * are read back off the Google session and used to pre-fill the form, leaving
 * the tick to be made by a person. The values come from the session cookie
 * rather than the query string on purpose: an email address in a URL ends up
 * in browser history and server access logs for no benefit.
 *
 * The "Continue with Google" control is rendered by SignupForm, not here: the
 * form owns every Google button so its signup mode and its already-registered
 * panel can never both show one at the same time.
 *
 * OWNER: Stream 2.
 */
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'

import { AppShell } from '@/components/shell/AppShell'
import { SignupForm } from '@/components/signup/SignupForm'
import { googleIdentity, googleSignInConfigured } from '@/lib/server/googleAuth'

export const metadata: Metadata = {
  title: 'Sign up · HSA Daily Patient Log',
  description:
    'Join the Homoeopathic Association of South Africa’s October 2026 patient data collection.',
}

export const dynamic = 'force-dynamic'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>
}) {
  const { google } = await searchParams

  // Only look for a Google session when the flow actually sent us here, so the
  // ordinary signup render stays a plain page with no session lookup.
  const identity =
    google === 'new' && googleSignInConfigured
      ? await googleIdentity(new Request('http://local/', { headers: await headers() }))
      : null

  return (
    <AppShell showNav={false}>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
        Sign up once
      </h1>
      <p className="mt-1.5 mb-5 text-[15px] text-neutral-600 dark:text-neutral-300">
        No password, no confirmation email. After this, opening your link goes
        straight to the log form.
      </p>

      {identity ? (
        <div className="mb-5 rounded-2xl bg-hsa-50 p-3.5 text-sm text-neutral-800 ring-1 ring-hsa-600/20 dark:bg-hsa-700/15 dark:text-neutral-100 dark:ring-hsa-500/30">
          <p>
            Google confirmed <strong className="break-all">{identity.email}</strong>
            , but it isn’t signed up yet. Your details are filled in below —
            check them, tick the consent box, and you’re in.
          </p>
        </div>
      ) : null}

      <SignupForm
        prefill={identity ? { email: identity.email, fullName: identity.name } : undefined}
        googleEnabled={googleSignInConfigured}
      />

      <p className="mt-6 border-t border-neutral-200 pt-4 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
        Already signed up?{' '}
        <Link
          href="/signin"
          className="font-medium text-green-700 hover:underline dark:text-green-400"
        >
          Sign in
        </Link>
        {' · '}
        Are you a researcher?{' '}
        <Link
          href="/researcher-signin"
          className="font-medium text-green-700 hover:underline dark:text-green-400"
        >
          Sign in here
        </Link>
      </p>
    </AppShell>
  )
}
