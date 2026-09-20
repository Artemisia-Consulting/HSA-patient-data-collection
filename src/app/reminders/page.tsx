/**
 * /reminders — the opt-in and preferences screen (FR7).
 *
 * Reached three ways: from the app's own navigation, from the "change your
 * reminder" footer of every reminder, and from the "Done for today" link in
 * one. The last two arrive as `/reminders?k=<reminderLinkId>` on a device
 * that may have no session at all, so the `k` is read here and threaded into
 * every API call the client component makes.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type { Metadata } from 'next'

import { REMINDER_LINK_QUERY_PARAM } from '@/lib/contract/api'
import { ReminderSettings } from './_components/ReminderSettings'

export const metadata: Metadata = {
  title: 'Reminders — HSA Daily Patient Log',
  description: 'Choose how and when you are reminded to log your patient numbers.',
}

// The screen reflects per-practitioner state that changes through the day.
export const dynamic = 'force-dynamic'

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params[REMINDER_LINK_QUERY_PARAM]
  const linkKey = typeof raw === 'string' && raw.length > 0 ? raw : null

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Daily reminders</h1>
        <p className="mt-2 text-sm opacity-75">
          A nudge so a busy day does not become a missing day in the October data.
          Monday to Friday, at a time you choose. Never on a Sunday.
        </p>
      </header>

      <ReminderSettings linkKey={linkKey} />

      <p className="mt-8 text-xs opacity-60">
        Reminders contain your name, the date and a link to your own log — never
        anything about a patient.
      </p>
    </main>
  )
}
