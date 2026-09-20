'use client'

/**
 * Connection status, with one deliberate caveat baked in: `navigator.onLine`
 * being true only means the device has *a* network interface, not that it can
 * reach us. A South African phone on a captive hotel wifi reports online and
 * fails every request.
 *
 * So the app treats this as a hint for the banner, and treats an actual failed
 * request as the truth — which is why the outbox keys off `ApiNetworkError`
 * rather than off this hook.
 *
 * OWNER: Stream 2.
 */
import { useEffect, useState } from 'react'

export function useOnline(): boolean {
  // Start optimistic: on the server, and on the first client render, we assume
  // online so the markup matches and there is no hydration flash of a banner.
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
