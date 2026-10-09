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
 * `guest` swaps the menu for guest mode's own (/guest). The important
 * difference is the last item: a guest *leaves*, they do not sign out. A
 * practitioner who opens guest mode on their own phone is still signed in
 * underneath, and "Sign out" here would end that real session for them.
 *
 * OWNER: Stream 2.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'

import { ServiceWorkerRegistrar } from '@/components/shell/ServiceWorkerRegistrar'
import { api } from '@/lib/client'

const NAV = [
  { href: '/log', label: 'Today’s log' },
  { href: '/reminders', label: 'Reminders' },
  { href: '/privacy', label: 'Privacy & POPIA' },
] as const

const GUEST_NAV = [
  { href: '/guest', label: 'Guest home' },
  { href: '/guest/log', label: 'Try the daily log' },
  { href: '/guest/dashboard', label: 'Sample research dashboard' },
  { href: '/privacy', label: 'Privacy & POPIA' },
] as const

interface AppShellProps {
  children: ReactNode
  /** Hide the nav on screens where there is nowhere else to go yet. */
  showNav?: boolean
  /** Guest mode: its own menu, and "Leave guest mode" instead of sign-out. */
  guest?: boolean
}

export function AppShell({ children, showNav = true, guest = false }: AppShellProps) {
  const router = useRouter()
  const [navOpen, setNavOpen] = useState(false)

  const [signingOut, setSigningOut] = useState(false)

  /**
   * Sign-out is a server round trip, not a localStorage delete. The session
   * cookie is httpOnly (so `document.cookie` cannot clear it) and the Session
   * row would otherwise stay valid for its full 120-day TTL. `api.signOut`
   * clears this device's stored token and link id in a `finally`, so a failed
   * request still leaves the phone signed out.
   */
  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await api.signOut()
    } finally {
      setSigningOut(false)
      // replace, not push: the back button must not return to a signed-in screen.
      router.replace('/signup')
      router.refresh()
    }
  }

  return (
    <>
      <ServiceWorkerRegistrar />
      <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
        <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2.5">
            <Link
              href={guest ? '/guest' : '/log'}
              className="flex min-h-[44px] items-center gap-2 font-bold text-neutral-900 dark:text-neutral-50"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-hsa-600 text-sm font-black text-white"
              >
                HSA
              </span>
              <span className="text-[15px]">Daily Patient Log</span>
              {guest ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                  Guest
                </span>
              ) : null}
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
                {(guest ? GUEST_NAV : NAV).map((item) => (
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
                {guest ? (
                  <li>
                    <Link
                      href="/signup"
                      onClick={() => setNavOpen(false)}
                      className="flex min-h-[48px] items-center text-[15px] font-medium text-red-700 dark:text-red-400"
                    >
                      Leave guest mode
                    </Link>
                  </li>
                ) : (
                  <li>
                    <button
                      type="button"
                      disabled={signingOut}
                      onClick={() => {
                        setNavOpen(false)
                        void handleSignOut()
                      }}
                      className="flex w-full min-h-[48px] items-center border-b border-neutral-100 text-[15px] font-medium text-red-700 last:border-b-0 dark:border-neutral-800 dark:text-red-400"
                    >
                      {signingOut ? 'Signing out…' : 'Sign out'}
                    </button>
                  </li>
                )}
              </ul>
            </nav>
          ) : null}
        </header>

        <main className="mx-auto max-w-md px-4 py-4">{children}</main>
      </div>
    </>
  )
}
