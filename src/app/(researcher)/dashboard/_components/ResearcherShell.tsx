'use client'

/**
 * The frame for the research screens.
 *
 * Deliberately not `AppShell`. That one is `max-w-md` on purpose — it is a
 * phone app that happens to open on a desktop. This is the opposite: a
 * fourteen-column table and four charts, read on a laptop by the two or three
 * people at HSA who analyse the October data, so it takes the full width.
 *
 * Sign-out returns to the researcher sign-in screen rather than practitioner
 * signup, because a researcher who signs out is not a practitioner who needs
 * to register.
 *
 * `demo` is the guest dashboard's frame (/guest/dashboard): "sample data" in
 * the title, a way back to guest mode instead of sign-out — a guest has no
 * session to end, and a practitioner looking around on their own laptop
 * should not lose theirs — and a footer that says nothing here is real.
 *
 * OWNER: Stream 2.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'

import { api } from '@/lib/client'

interface ResearcherShellProps {
  children: ReactNode
  /** Shown under the title — usually who is signed in. */
  subtitle?: string
  /** The guest dashboard: sample data, no session, no sign-out. */
  demo?: boolean
}

export function ResearcherShell({ children, subtitle, demo = false }: ResearcherShellProps) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await api.signOut()
    } finally {
      setSigningOut(false)
      // replace, not push: back must not return to the dashboard.
      router.replace('/researcher-signin')
      router.refresh()
    }
  }

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hsa-600 text-sm font-black text-white"
            >
              HSA
            </span>
            <div className="leading-tight">
              <h1 className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-neutral-900 dark:text-neutral-50">
                Research dashboard
                {demo ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                    Sample data
                  </span>
                ) : null}
              </h1>
              {subtitle ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Link
              href="/privacy"
              className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Privacy &amp; POPIA
            </Link>
            {demo ? (
              <Link
                href="/guest"
                className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Back to guest mode
              </Link>
            ) : (
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-neutral-800"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-neutral-500 dark:text-neutral-400">
        {demo
          ? 'Every figure on this page is made-up sample data, generated in your browser. None of it comes from a real practitioner or patient, and nothing on this page is the HSA’s October dataset.'
          : 'Every figure on this page is an aggregate of de-identified entries. No patient identifier is collected anywhere in this system, and no practitioner email is served to this screen or to the Excel and CSV exports.'}
      </footer>
    </div>
  )
}
