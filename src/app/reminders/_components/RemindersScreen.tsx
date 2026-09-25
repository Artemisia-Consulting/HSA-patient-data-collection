'use client'

/**
 * The client half of /reminders: picks between the one-off setup question and
 * the everyday preferences screen, and frames whichever it is in the app
 * shell — the reminder page must always carry the menu, both because the menu
 * is where it is reached from and because it is the way out.
 *
 * In setup mode the session decides everything: `FirstRunReminderChoice`
 * bounces anyone who has already answered to the log, and the anonymous to
 * signup. Offline, the choice cannot be saved anyway, so it says so instead
 * of spinning forever.
 *
 * In everyday mode the screen must keep working on a device that has never
 * had a session — that is what `linkKey` is for — so the preferences form
 * renders regardless of the session state.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { AppShell } from '@/components/shell/AppShell'
import { useSession } from '@/components/session/useSession'
import { Button } from '@/components/ui/Button'
import { FirstRunReminderChoice } from './FirstRunReminderChoice'
import { ReminderSettings } from './ReminderSettings'

export function RemindersScreen({
  linkKey,
  setup,
}: {
  linkKey: string | null
  setup: boolean
}) {
  const { status, refresh } = useSession()

  if (setup) {
    return (
      <AppShell>
        {status === 'offline' ? (
          <div className="py-10 text-center">
            <p className="text-[15px] text-neutral-700 dark:text-neutral-200">
              You’re offline. Reconnect and try again — your choice is saved on
              the server, so nothing is lost.
            </p>
            <div className="mt-4">
              <Button onClick={() => void refresh()}>Try again</Button>
            </div>
          </div>
        ) : (
          <>
            <header className="mb-6">
              <h1 className="text-2xl font-semibold">One quick question</h1>
              <p className="mt-2 text-sm opacity-75">
                Before you start: how should we remind you to log your patient
                numbers each evening? Pick one to continue — you can change it
                any time from the menu.
              </p>
            </header>
            <FirstRunReminderChoice />
          </>
        )}
      </AppShell>
    )
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Daily reminders</h1>
        <p className="mt-2 text-sm opacity-75">
          A nudge so a busy day does not become a missing day in the October
          data. Monday to Friday, at a time you choose. Never on a Sunday.
        </p>
      </header>

      <ReminderSettings linkKey={linkKey} />

      <p className="mt-8 text-xs opacity-60">
        Reminders contain your name, the date and a link to your own log — never
        anything about a patient.
      </p>
    </AppShell>
  )
}
