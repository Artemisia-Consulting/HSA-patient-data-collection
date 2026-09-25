/**
 * /signin — the way back in for a practitioner who is already registered.
 *
 * The app was built around one entry route: the personalised `?k=` link in a
 * reminder. That is still the fastest way in, and it still works. But it is
 * also the only way in, which means a practitioner who has cleared their
 * browser, changed phone, or simply lost the email has nothing to do but wait
 * for the next reminder. This screen fixes that: Google confirms they own the
 * email address they signed up with, and the app mints its own session from
 * that — no password to remember, and no new personal data collected, because
 * the email is one we already hold.
 *
 * The reminder-link box stays underneath as the fallback for anyone who does
 * not use Google, or for a deployment where Google sign-in is not configured.
 *
 * OWNER: Stream 2.
 */
import type { Metadata } from 'next'
import Link from 'next/link'

import { AppShell } from '@/components/shell/AppShell'
import { GoogleSignInLink } from '@/components/signin/GoogleSignInLink'
import { ReminderLinkForm } from '@/components/signin/ReminderLinkForm'
import { googleSignInConfigured } from '@/lib/server/googleAuth'

export const metadata: Metadata = {
  title: 'Sign in · HSA Daily Patient Log',
  description: 'Get back into your daily patient log.',
}

export const dynamic = 'force-dynamic'

/** What each `?google=` value means, in the practitioner's terms. */
const GOOGLE_MESSAGES: Record<string, string> = {
  error:
    'Google sign-in didn’t complete. Nothing was lost — try again, or use your reminder link below.',
  unverified:
    'Google didn’t confirm that email address as yours. Try again, or use your reminder link below.',
  unavailable:
    'Google sign-in isn’t available on this deployment. Use your reminder link below.',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>
}) {
  const { google } = await searchParams
  const message = google ? GOOGLE_MESSAGES[google] : undefined

  return (
    <AppShell showNav={false}>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
        Sign back in
      </h1>
      <p className="mt-1.5 mb-5 text-[15px] text-neutral-600 dark:text-neutral-300">
        You only sign up once. This is for getting back to your log on a new
        phone, or after clearing your browser.
      </p>

      {message ? (
        <p
          role="alert"
          className="mb-5 rounded-2xl bg-amber-50 p-3.5 text-sm font-medium text-amber-900 ring-1 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30"
        >
          {message}
        </p>
      ) : null}

      {googleSignInConfigured ? (
        <>
          <GoogleSignInLink />
          <p className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
            Use the same email address you signed up with. We receive only that
            address and your name — never your Google password, contacts or
            anything else.
          </p>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              or
            </span>
            <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
          </div>
        </>
      ) : null}

      <ReminderLinkForm />

      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-300">
        Can’t find your link? Email{' '}
        <a className="underline" href="mailto:adrianadraxl@gmail.com">
          adrianadraxl@gmail.com
        </a>{' '}
        and we’ll resend it.
      </p>

      <p className="mt-6 border-t border-neutral-200 pt-4 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
        Not signed up yet?{' '}
        <Link
          href="/signup"
          className="font-medium text-green-700 hover:underline dark:text-green-400"
        >
          Sign up here
        </Link>
      </p>
    </AppShell>
  )
}
