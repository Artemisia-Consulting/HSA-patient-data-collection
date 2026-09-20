'use client'

/**
 * The daily entry screen — and the destination of every personalised reminder
 * link, `${APP_URL}/log?k=<reminderLinkId>` (FR1, FR3).
 *
 * `useSession` handles the `?k=` exchange, so this component only has to
 * decide between four states. The important one is `offline`: a practitioner
 * who has logged here before gets the form anyway, because `DailyLogForm`
 * works from the cached taxonomy and queues the submit.
 *
 * OWNER: Stream 2.
 */
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { DailyLogForm } from '@/components/log/DailyLogForm'
import { AppShell } from '@/components/shell/AppShell'
import { useSession } from '@/components/session/useSession'
import { Button } from '@/components/ui/Button'
import { getSessionToken } from '@/lib/client'
import { todayInSast } from '@/lib/dates'

export default function LogPage() {
  const router = useRouter()
  const { status, practitioner, today, refresh } = useSession()

  useEffect(() => {
    if (status === 'anonymous') router.replace('/signup')
    else if (status === 'ready' && practitioner && !practitioner.onboardedAt) {
      router.replace('/welcome')
    }
  }, [practitioner, router, status])

  if (status === 'offline') {
    // Known device, no signal: give them the form. Today falls back to the
    // device clock here because there is no server to ask — the date chip is
    // editable, and the entry is filed under whatever date it carries.
    if (getSessionToken()) {
      return (
        <AppShell>
          <DailyLogForm today={todayInSast()} />
        </AppShell>
      )
    }
    return (
      <AppShell showNav={false}>
        <div className="py-10 text-center">
          <p className="text-[15px] text-neutral-700 dark:text-neutral-200">
            You’re offline and this device isn’t signed in yet.
          </p>
          <div className="mt-4">
            <Button onClick={() => void refresh()}>Try again</Button>
          </div>
        </div>
      </AppShell>
    )
  }

  if (status !== 'ready' || !today) {
    return (
      <AppShell>
        <div className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">Loading your log…</span>
          <div aria-hidden="true" className="h-[86px] animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
          <div aria-hidden="true" className="h-[132px] animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
          <div aria-hidden="true" className="h-[132px] animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <DailyLogForm today={today} />
    </AppShell>
  )
}
