/**
 * "Continue with Google".
 *
 * A plain anchor, not a button: the target is a GET route that 302s to Google
 * (see /api/auth/google/start), so this needs no JavaScript, no client-side
 * auth library and no bundle growth. It also means the control still works on
 * the first paint, before hydration — which matters on the phones this app is
 * built for.
 *
 * `prefetch` is irrelevant and `<Link>` would be wrong here: this leaves the
 * Next.js app entirely.
 *
 * OWNER: Stream 2.
 */
import { GOOGLE_START_PATH } from '@/lib/contract'

export function GoogleSignInLink({ label = 'Continue with Google' }: { label?: string }) {
  return (
    <a
      href={GOOGLE_START_PATH}
      className="inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-xl bg-white px-5 text-lg font-semibold text-neutral-800 shadow-sm ring-1 ring-inset ring-neutral-300 transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hsa-600 dark:bg-neutral-800 dark:text-neutral-50 dark:ring-neutral-600 dark:hover:bg-neutral-700"
    >
      <GoogleMark />
      {label}
    </a>
  )
}

/** Google's four-colour mark, inlined so the button never waits on a network image. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-6 w-6 shrink-0">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}
