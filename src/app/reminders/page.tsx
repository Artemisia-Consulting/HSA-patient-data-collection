/**
 * /reminders — the opt-in and preferences screen (FR7).
 *
 * Reached three ways: from the app's menu, from the "change your reminder"
 * footer of every reminder, and from the "Done for today" link in one. The
 * last two arrive as `/reminders?k=<reminderLinkId>` on a device that may
 * have no session at all, so the `k` is read here and threaded into every
 * API call the client component makes.
 *
 * A fourth arrival, `/reminders?setup=1`, is the one-off compulsory choice
 * every practitioner answers between the walkthrough and the log.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type { Metadata } from 'next'

import { REMINDER_LINK_QUERY_PARAM } from '@/lib/contract/api'
import { RemindersScreen } from './_components/RemindersScreen'

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
  const setup = params.setup === '1'

  return <RemindersScreen linkKey={linkKey} setup={setup} />
}
