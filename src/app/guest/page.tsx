/**
 * /guest — the front door for people who are neither practitioners nor
 * researchers: HSA members who are curious, colleagues being shown the
 * project, anyone deciding whether to take part.
 *
 * Guest mode is deliberately not an account. There is no guest row in the
 * database, no session and no request to any authenticated route, so a guest
 * can neither add to the October dataset nor see any of it:
 *
 *  - /guest/log runs the real logging form in practice mode — nothing is
 *    saved, not even the remembered answer defaults.
 *  - /guest/dashboard is the research dashboard drawn from made-up sample data
 *    generated in the browser (src/lib/client/demo/sample-dashboard.ts).
 *
 * A practitioner who wanders in here stays signed in underneath, which is why
 * the guest menu says "Leave guest mode" and never "Sign out".
 *
 * OWNER: Stream 2.
 */
import type { Metadata } from 'next'
import Link from 'next/link'

import { AppShell } from '@/components/shell/AppShell'

export const metadata: Metadata = {
  title: 'Guest mode · HSA Daily Patient Log',
  description:
    'Look around the HSA October 2026 patient data collection app — nothing you do is saved, and no real data is shown.',
}

const CARD =
  'block rounded-2xl bg-white p-5 ring-1 ring-neutral-200 transition hover:ring-hsa-600 dark:bg-neutral-900 dark:ring-neutral-800 dark:hover:ring-hsa-500'

export default function GuestHomePage() {
  return (
    <AppShell guest>
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Guest mode</p>
      <h1 className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-50">
        Have a look around
      </h1>
      <p className="mt-1.5 text-[15px] text-neutral-600 dark:text-neutral-300">
        This is the app homoeopaths use to log their patients for the HSA’s
        October 2026 data collection. As a guest you can try everything a
        practitioner does — but nothing you enter is saved or sent, and you
        never see real study data.
      </p>

      <div className="mt-5 space-y-3">
        <Link href="/guest/log" className={CARD}>
          <span aria-hidden="true" className="text-3xl">
            🩺
          </span>
          <h2 className="mt-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">
            Try the daily log
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-200">
            The real form practitioners fill in each evening: how many new and
            returning patients, then what each one presented with. A practice
            run — nothing is saved.
          </p>
        </Link>

        <Link href="/guest/dashboard" className={CARD}>
          <span aria-hidden="true" className="text-3xl">
            📊
          </span>
          <h2 className="mt-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">
            See the research dashboard
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-200">
            What the HSA research team sees, filled with{' '}
            <strong>made-up sample data</strong>. The filters and charts all
            work; the numbers are not real.
          </p>
        </Link>
      </div>

      <div className="mt-6 rounded-2xl bg-hsa-50 p-4 ring-1 ring-hsa-600/20 dark:bg-hsa-700/15 dark:ring-hsa-500/30">
        <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-50">
          Taking part in the study?
        </h2>
        <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">
          If you are a homoeopathic practitioner joining the October collection,
          sign up instead so that your entries count.
        </p>
        <Link
          href="/signup"
          className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-hsa-600 px-4 text-sm font-semibold text-white hover:bg-hsa-700"
        >
          Practitioner sign-up
        </Link>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
          Already signed up?{' '}
          <Link
            href="/signin"
            className="font-medium text-green-700 hover:underline dark:text-green-400"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AppShell>
  )
}
