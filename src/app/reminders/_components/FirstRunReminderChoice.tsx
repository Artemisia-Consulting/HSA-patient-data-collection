'use client'

/**
 * The one-off reminder question (FR7): email, or no reminders at all.
 *
 * Every practitioner answers this once, right after the walkthrough, before
 * they reach the log for the first time. It is "compulsory" in the sense
 * that the save button stays locked until they tap one of the two options —
 * "No reminders" is as valid an answer as "Email", but skipping past the
 * question without choosing is not. There is always a way out ("Decide
 * later"), and someone who takes it is asked again the next time they open
 * the app from the start — never mid-session, and never once
 * `reminderChoiceAt` is set, whichever answer they gave.
 *
 * Reached only through `/reminders?setup=1` (the entry router sends them
 * here), so it runs with a session and needs no `?k=` link key.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { useSession } from '@/components/session/useSession'
import type { ReminderPreferences } from '@/lib/contract/api'
import { DEFAULT_REMINDER_TIME, type ReminderChannel } from '@/lib/contract/enums'
import { saveReminderPreferences } from './api'
import { ChannelPicker } from './ChannelPicker'
import { ScheduleFields } from './ScheduleFields'

export function FirstRunReminderChoice() {
  const router = useRouter()
  const { status, practitioner } = useSession()

  // Null until the practitioner taps an option: the question must be
  // answered, not defaulted, so neither choice ships pre-selected.
  const [channel, setChannel] = useState<ReminderChannel | null>(null)
  const [time, setTime] = useState(DEFAULT_REMINDER_TIME)
  const [includeSaturday, setIncludeSaturday] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeError, setTimeError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/signup')
      return
    }
    // Already answered — never ask again, whichever way they answered.
    if (status === 'ready' && practitioner?.reminderChoiceAt) {
      router.replace('/log')
    }
  }, [practitioner?.reminderChoiceAt, router, status])

  if (status !== 'ready' || !practitioner || practitioner.reminderChoiceAt) {
    return (
      <p className="py-12 text-center text-sm opacity-70" role="status">
        Loading&hellip;
      </p>
    )
  }

  async function onSave() {
    if (!channel || busy) return
    setBusy(true)
    setError(null)
    setTimeError(undefined)

    const preferences = {
      channel,
      time,
      includeSaturday,
    } satisfies ReminderPreferences

    const result = await saveReminderPreferences(null, preferences)
    if (result.ok) {
      // The server has stamped reminderChoiceAt; straight to the log.
      router.replace('/log')
      return
    }

    setError(result.message)
    setTimeError(result.fieldErrors?.time?.[0])
    setBusy(false)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void onSave()
      }}
      className="space-y-6"
    >
      <ChannelPicker
        value={channel}
        onChange={setChannel}
        disabled={busy}
      />

      {channel === 'EMAIL' ? (
        <ScheduleFields
          time={time}
          includeSaturday={includeSaturday}
          timeError={timeError}
          onTimeChange={setTime}
          onIncludeSaturdayChange={setIncludeSaturday}
          disabled={busy}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Button type="submit" size="lg" fullWidth busy={busy} disabled={!channel}>
          {channel === 'NONE' ? 'No reminders — start logging' : 'Save and start logging'}
        </Button>
        {!channel ? (
          <p className="text-center text-xs opacity-70">
            Pick one to continue — you can change it any time in the menu.
          </p>
        ) : null}
        <Button
          variant="ghost"
          fullWidth
          disabled={busy}
          onClick={() => router.replace('/log')}
        >
          Decide later
        </Button>
      </div>
    </form>
  )
}
