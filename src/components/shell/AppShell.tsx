'use client'

/**
 * The frame every practitioner screen sits in: a compact header, a collapsible
 * nav, and the service-worker registration.
 *
 * The nav is a disclosure rather than a permanent bar because there are only
 * three destinations and the log screen needs its vertical space. It is a real
 * `aria-expanded` button controlling a real region, not a CSS-only checkbox
 * hack, so it announces correctly.
 *
 * `max-w-md` throughout: this is a phone app that happens to open on desktops,
 * not a responsive desktop app squeezed down.
 *
 * OWNER: Stream 2.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'

import { ServiceWorkerRegistrar } from '@/components/shell/ServiceWorkerRegistrar'

const NAV = [
  { href: '/log', label: 'Today’s log' },
  { href: '/reminders', label: 'Reminders' },
  { href: '/privacy', label: 'Privacy & POPIA' },
] as const

interface AppShellProps {
  children: ReactNode
  /** Hide the nav on screens where there is nowhere else to go yet. */
  showNav?: boolean
}

export function AppShell({ children, showNav = true }: AppShellProps) {
  const router = useRouter()
  const [navOpen, setNavOpen] = useState(false)

  function handleSignOut() {
    localStorage.removeItem('hsa.session')
    document.cookie = 'hsa_session=; path=/; max-age=0'
    router.push('/signup')
  }

  return (
    <>
      <ServiceWorkerRegistrar />
      <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
        <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2.5">
            <Link
              href="/log"
              className="flex min-h-[44px] items-center gap-2 font-bold text-neutral-900 dark:text-neutral-50"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-hsa-600 text-sm font-black text-white"
              >
                HSA
              </span>
              <span className="text-[15px]">Daily Patient Log</span>
            </Link>

            {showNav ? (
              <button
                type="button"
                aria-expanded={navOpen}
                aria-controls="app-nav"
                aria-label={navOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setNavOpen((open) => !open)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  {navOpen ? '✕' : '☰'}
                </span>
              </button>
            ) : null}
          </div>

          {showNav && navOpen ? (
            <nav
              id="app-nav"
              aria-label="Main"
              className="border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
            >
              <ul className="mx-auto max-w-md px-4 py-1">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setNavOpen(false)}
                      className="flex min-h-[48px] items-center border-b border-neutral-100 text-[15px] font-medium text-neutral-800 last:border-b-0 dark:border-neutral-800 dark:text-neutral-100"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setNavOpen(false)
                      handleSignOut()
                    }}
                    className="flex w-full min-h-[48px] items-center border-b border-neutral-100 text-[15px] font-medium text-red-700 last:border-b-0 dark:border-neutral-800 dark:text-red-400"
                  >
                    Sign out
                  </button>
                </li>
              </ul>
            </nav>
          ) : null}
        </header>

        <main className="mx-auto max-w-md px-4 py-4">{children}</main>
      </div>
    </>
  )
}
