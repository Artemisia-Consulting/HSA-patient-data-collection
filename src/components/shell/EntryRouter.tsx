'use client'

/**
 * What happens when someone opens the bare app URL.
 *
 * The rule the brief cares about (user story 2.1, rubric item 2): a returning
 * practitioner must land on the log form having re-entered nothing. So this
 * resolves the session once and forwards — signup if we have never met them,
 * the walkthrough if we have but they have not finished it, otherwise straight
 * to the log.
 *
 * Offline with a session still goes to the log. The form is usable from cache
 * and the outbox will carry the entry when the signal comes back; bouncing
 * someone to an error page because the network blipped would lose the day's
 * entry for no reason.
 *
 * OWNER: Stream 2.
 */
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useSession } from '@/components/session/useSession'
import { getSessionToken } from '@/lib/client'

export function EntryRouter() {
  const router = useRouter()
  const { status, practitioner } = useSession()

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'anonymous') {
      router.replace('/signup')
      return
    }
    if (status === 'offline') {
      if (getSessionToken()) router.replace('/log')
      return
    }
    router.replace(practitioner?.onboardedAt ? '/log' : '/welcome')
  }, [practitioner?.onboardedAt, router, status])

  if (status === 'offline' && !getSessionToken()) {
    return (
      <p className="py-10 text-center text-sm text-neutral-600 dark:text-neutral-300">
        You’re offline and this device isn’t signed in yet. Reconnect and open
        this link again.
      </p>
    )
  }

  return (
    <div className="py-10" role="status" aria-live="polite">
      <span className="sr-only">Opening your log…</span>
      {/* Skeleton rather than a spinner: same height as the real screen, so
          there is no layout shift when it swaps in (rubric item 10). */}
      <div aria-hidden="true" className="space-y-3">
        <div className="h-16 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-28 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-28 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
      </div>
    </div>
  )
}
