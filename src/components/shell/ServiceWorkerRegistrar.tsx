'use client'

/**
 * Registers the PWA service worker (rubric item 9, tier 3).
 *
 * Production only, deliberately: a cache-first worker and Next's dev HMR fight
 * each other, and debugging a stale chunk served from a dev service worker
 * would cost more than it saves. The *offline save* for a daily entry does not
 * depend on this — that is the outbox in `src/lib/client/outbox.ts`, which
 * works in every environment. The worker only makes the shell load without a
 * network.
 *
 * It also cleans up after itself: outside production it unregisters any worker
 * a previous production build left on the device.
 *
 * OWNER: Stream 2.
 */
import { useEffect } from 'react'

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) void registration.unregister()
        })
        .catch(() => {
          /* nothing registered */
        })
      return
    }

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // An unregistrable worker is not worth a visible error: the app works
        // online without it.
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
