'use client'

/**
 * The fallback way back in: paste the personalised link from a reminder.
 *
 * This used to live inside SignupForm's duplicate-email panel. It is shared
 * now because it is needed in two places — that panel, and the sign-in screen
 * — and a second copy would be a second thing to keep correct.
 *
 * It deliberately accepts either the whole URL or just the code after `k=`,
 * because what someone pastes off a phone is whatever the mail client gave
 * them, and refusing a slightly wrong paste is how people give up.
 *
 * OWNER: Stream 2.
 */
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { api, reminderLinkIdFromUrl } from '@/lib/client'

export function ReminderLinkForm({
  submitLabel = 'Use this link',
  notRecognisedHint,
}: {
  submitLabel?: string
  /** Extra sentence shown when the link is rejected, e.g. naming their email. */
  notRecognisedHint?: string
}) {
  const router = useRouter()
  const [linkValue, setLinkValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const linkId = reminderLinkIdFromUrl(linkValue)
    if (!linkId) {
      setError('Paste the whole link from your reminder, or just the code after “k=”.')
      return
    }

    setBusy(true)
    try {
      await api.resume(linkId)
      router.replace('/log')
    } catch {
      setError(
        notRecognisedHint ??
          'That link isn’t recognised. Ask the HSA to resend it to your email address.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="recover-link"
          className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200"
        >
          Paste your logging link
        </label>
        <input
          id="recover-link"
          type="text"
          value={linkValue}
          onChange={(event) => setLinkValue(event.target.value)}
          placeholder="https://…/log?k=…"
          autoComplete="off"
          aria-invalid={Boolean(error)}
          className="min-h-[48px] w-full rounded-xl bg-neutral-50 px-3 text-base text-neutral-900 ring-1 ring-inset ring-neutral-300 focus:ring-2 focus:ring-hsa-600 dark:bg-neutral-800 dark:text-neutral-50 dark:ring-neutral-700"
        />
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          It’s in any reminder we’ve sent you. Opening that link on this phone
          does the same thing and is quicker.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" fullWidth busy={busy}>
        {submitLabel}
      </Button>
    </form>
  )
}
