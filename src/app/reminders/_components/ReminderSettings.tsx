'use client'

/**
 * The reminder preferences screen (FR7).
 *
 * Holds all the state for /reminders: loads the status, edits a local draft
 * of the preferences, saves it, and drives snooze / done-for-today. The child
 * components are presentational.
 *
 * `linkKey` is the `?k=` value the page was opened with. It is threaded
 * through every request so a practitioner who followed a reminder on a brand
 * new phone can change their time or turn reminders off without signing in.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { useCallback, useEffect, useState } from 'react'

import type { ReminderPreferences, ReminderStatusResponse } from '@/lib/contract/api'
import { DEFAULT_REMINDER_TIME, type ReminderChannel } from '@/lib/contract/enums'
import {
  getReminderStatus,
  markDoneToday,
  saveReminderPreferences,
  snoozeReminder,
  type ApiResult,
} from './api'
import { ChannelPicker } from './ChannelPicker'
import { ScheduleFields } from './ScheduleFields'
import { TodayPanel } from './TodayPanel'

interface Draft {
  channel: ReminderChannel
  time: string
  includeSaturday: boolean
  whatsappNumber: string
}

const EMPTY_DRAFT: Draft = {
  channel: 'NONE',
  time: DEFAULT_REMINDER_TIME,
  includeSaturday: false,
  whatsappNumber: '',
}

function draftFrom(status: ReminderStatusResponse): Draft {
  return {
    channel: status.preferences.channel,
    time: status.preferences.time,
    includeSaturday: status.preferences.includeSaturday,
    whatsappNumber: status.preferences.whatsappNumber ?? '',
  }
}

export function ReminderSettings({ linkKey }: { linkKey: string | null }) {
  const [status, setStatus] = useState<ReminderStatusResponse | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  /** Fold any endpoint's response into screen state — they all return status. */
  const apply = useCallback(
    (result: ApiResult<ReminderStatusResponse>, successMessage?: string) => {
      if (result.ok) {
        setStatus(result.data)
        setDraft(draftFrom(result.data))
        setError(null)
        setFieldErrors({})
        setMessage(successMessage ?? null)
        setPhase('ready')
        return true
      }
      setError(result.message)
      setFieldErrors(result.fieldErrors ?? {})
      setMessage(null)
      return false
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    void getReminderStatus(linkKey).then((result) => {
      if (cancelled) return
      if (!apply(result)) setPhase('unavailable')
    })
    return () => {
      cancelled = true
    }
  }, [linkKey, apply])

  async function run(
    action: () => Promise<ApiResult<ReminderStatusResponse>>,
    successMessage?: string,
  ) {
    setBusy(true)
    try {
      apply(await action(), successMessage)
    } finally {
      setBusy(false)
    }
  }

  function onSave(event: React.FormEvent) {
    event.preventDefault()
    // The server re-validates with the same Zod schema; this shapes the
    // payload rather than trusting it.
    const preferences = {
      channel: draft.channel,
      time: draft.time,
      includeSaturday: draft.includeSaturday,
      whatsappNumber:
        draft.channel === 'WHATSAPP' ? draft.whatsappNumber.trim() : null,
    } as ReminderPreferences

    void run(
      () => saveReminderPreferences(linkKey, preferences),
      draft.channel === 'NONE' ? 'Reminders turned off.' : 'Reminder settings saved.',
    )
  }

  if (phase === 'loading') {
    return (
      <p className="py-12 text-center text-sm opacity-70" role="status">
        Loading your reminder settings&hellip;
      </p>
    )
  }

  if (phase === 'unavailable' || !status) {
    return (
      <div role="alert" className="rounded-xl border border-black/15 p-4 dark:border-white/20">
        <h2 className="text-base font-semibold">We could not load your settings</h2>
        <p className="mt-2 text-sm opacity-80">
          {error ?? 'Please try again.'}
        </p>
        <p className="mt-2 text-sm opacity-80">
          Open the app from your reminder link, or sign in again on this device.
        </p>
      </div>
    )
  }

  const dirty =
    status.preferences.channel !== draft.channel ||
    status.preferences.time !== draft.time ||
    status.preferences.includeSaturday !== draft.includeSaturday ||
    (status.preferences.whatsappNumber ?? '') !== draft.whatsappNumber

  return (
    <div className="space-y-6">
      <TodayPanel
        status={status}
        busy={busy}
        onSnooze={(minutes) =>
          void run(() => snoozeReminder(linkKey, minutes), 'Snoozed.')
        }
        onDone={() =>
          void run(() => markDoneToday(linkKey), 'Marked done for today.')
        }
      />

      <form onSubmit={onSave} className="space-y-6">
        <ChannelPicker
          value={draft.channel}
          whatsappNumber={draft.whatsappNumber}
          whatsappError={fieldErrors.whatsappNumber?.[0]}
          onChange={(channel) => setDraft((current) => ({ ...current, channel }))}
          onWhatsappNumberChange={(whatsappNumber) =>
            setDraft((current) => ({ ...current, whatsappNumber }))
          }
          disabled={busy}
        />

        {draft.channel === 'NONE' ? null : (
          <ScheduleFields
            time={draft.time}
            includeSaturday={draft.includeSaturday}
            timeError={fieldErrors.time?.[0]}
            onTimeChange={(time) => setDraft((current) => ({ ...current, time }))}
            onIncludeSaturdayChange={(includeSaturday) =>
              setDraft((current) => ({ ...current, includeSaturday }))
            }
            disabled={busy}
          />
        )}

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="space-y-2">
          <button
            type="submit"
            disabled={busy || !dirty}
            className="w-full rounded-lg bg-hsa-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save reminder settings'}
          </button>
          <p className="min-h-[1.25rem] text-center text-sm text-hsa-700" aria-live="polite">
            {message ?? ''}
          </p>
        </div>
      </form>
    </div>
  )
}
