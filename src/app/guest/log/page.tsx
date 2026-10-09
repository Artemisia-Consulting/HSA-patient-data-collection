/**
 * /guest/log — the daily log form, as a guest.
 *
 * The same `DailyLogForm` a practitioner uses, in guest mode: practice mode's
 * "never call the API, never write a draft", plus no remembered defaults. It
 * needs no session, so "today" is worked out here on the server in SAST rather
 * than coming from /api/auth/me.
 *
 * OWNER: Stream 2.
 */
import type { Metadata } from 'next'

import { DailyLogForm } from '@/components/log/DailyLogForm'
import { AppShell } from '@/components/shell/AppShell'
import { todayInSast } from '@/lib/dates'

export const metadata: Metadata = {
  title: 'Try the daily log · Guest mode · HSA Daily Patient Log',
  description: 'A practice run of the HSA daily patient log. Nothing is saved.',
}

// "Today" must be today, not the day of the build.
export const dynamic = 'force-dynamic'

export default function GuestLogPage() {
  return (
    <AppShell guest>
      <DailyLogForm today={todayInSast()} guest />
    </AppShell>
  )
}
