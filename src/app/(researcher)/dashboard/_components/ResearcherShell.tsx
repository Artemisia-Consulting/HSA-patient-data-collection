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
}

export function ResearcherShell({ children, subtitle }: ResearcherShellProps) {
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
              <h1 className="text-[15px] font-bold text-neutral-900 dark:text-neutral-50">
                Research dashboard
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
            <button
              type="button"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-neutral-800"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-neutral-500 dark:text-neutral-400">
        Every figure on this page is an aggregate of de-identified entries. No patient
        identifier is collected anywhere in this system, and no practitioner email is
        served to this screen or to the CSV export.
      </footer>
    </div>
  )
}
