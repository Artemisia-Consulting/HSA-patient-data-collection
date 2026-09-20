'use client'

/**
 * First-login walkthrough (FR2). Client-side because it needs the resolved
 * session — both to greet the practitioner by name and to know whether they
 * have already been through it.
 *
 * OWNER: Stream 2.
 */
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { AppShell } from '@/components/shell/AppShell'
import { useSession } from '@/components/session/useSession'
import { todayInSast } from '@/lib/dates'

export default function WelcomePage() {
  const router = useRouter()
  const { status, practitioner, today } = useSession()

  useEffect(() => {
    if (status === 'anonymous') router.replace('/signup')
  }, [router, status])

  if (status !== 'ready' || !practitioner) {
    return (
      <AppShell showNav={false}>
        <div className="space-y-3 py-10" role="status" aria-live="polite">
          <span className="sr-only">Loading…</span>
          <div aria-hidden="true" className="h-8 w-2/3 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          <div aria-hidden="true" className="h-44 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell showNav={false}>
      <OnboardingFlow
        firstName={practitioner.fullName.split(' ')[0] || practitioner.fullName}
        today={today ?? todayInSast()}
      />
    </AppShell>
  )
}
