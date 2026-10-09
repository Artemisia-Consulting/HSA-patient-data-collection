/**
 * "Just looking?" — the way into guest mode from the sign-up and sign-in
 * screens, for anyone who is neither a practitioner nor a researcher.
 *
 * It sits below everything else on those screens: the people the study needs
 * are practitioners signing up, and this must not read as the easier option
 * for them. It is a plain link, because guest mode is a place, not a sign-in —
 * there is no account and nothing to submit.
 *
 * OWNER: Stream 2.
 */
import Link from 'next/link'

export function GuestInvite() {
  return (
    <div className="mt-6 rounded-2xl bg-white p-4 text-center ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        Not a practitioner? Just curious?
      </p>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
        Try the logging form and see the research dashboard with sample data.
        Nothing is saved, and no real data is shown.
      </p>
      <Link
        href="/guest"
        className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        Look around as a guest
      </Link>
    </div>
  )
}
