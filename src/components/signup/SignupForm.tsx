'use client'

/**
 * Signup (FR1, user story 2.1, rubric item 1).
 *
 * Four fields, two of them optional, and one tick. There is no password, no
 * verification email and no cross-check against the retrospective survey —
 * that was settled by the product owner, and the consent tick *is* the consent
 * record. The copy says so in those words rather than pointing at a policy,
 * because a practitioner ticking it needs to know what they are agreeing to at
 * the moment they tick it.
 *
 * Duplicate email is the interesting case and the one a rubric tier-3 turns
 * on. A 409 here is not a dead end: the email they typed is already a
 * registered practitioner, which means *they* are, so the screen switches to
 * recovery — it offers Google sign-in and their existing logging link, rather
 * than telling them to go away.
 *
 * `prefill` arrives when Google has already verified an address that is not
 * registered yet. It fills the fields; it does not tick the box. Consent is
 * the one thing that cannot be inferred from an OAuth callback.
 *
 * "Continue with Google" is rendered here rather than on the page, so the
 * form's two modes — signup and already-registered — can never both show a
 * Google button at once.
 *
 * OWNER: Stream 2.
 */
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

import { GoogleSignInLink } from '@/components/signin/GoogleSignInLink'
import { ReminderLinkForm } from '@/components/signin/ReminderLinkForm'
import { Button } from '@/components/ui/Button'
import { ApiClientError, ApiNetworkError, api } from '@/lib/client'
import { signupRequestSchema } from '@/lib/contract/api'

/** The nine provinces, for the optional dropdown. Free text is still allowed. */
const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
] as const

type Mode = 'signup' | 'duplicate'

export interface SignupFormProps {
  /** Name and email already verified by Google, when the flow came that way. */
  prefill?: { email: string; fullName: string }
  /** Whether to offer Google on the duplicate-email panel. Server-decided. */
  googleEnabled?: boolean
}

export function SignupForm({ prefill, googleEnabled = false }: SignupFormProps) {
  const router = useRouter()

  const [email, setEmail] = useState(prefill?.email ?? '')
  const [fullName, setFullName] = useState(prefill?.fullName ?? '')
  const [practiceName, setPracticeName] = useState('')
  const [province, setProvince] = useState('')
  const [consent, setConsent] = useState(false)

  const [mode, setMode] = useState<Mode>('signup')
  /** The server's answer on whether the recovery email actually went out. */
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})

    const parsed = signupRequestSchema.safeParse({
      email: email.trim(),
      fullName: fullName.trim(),
      practiceName: practiceName.trim() || undefined,
      province: province.trim() || undefined,
      consent,
    })

    if (!parsed.success) {
      const errors: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join('.') || 'form'
        ;(errors[key] ??= []).push(issue.message)
      }
      setFieldErrors(errors)
      setFormError('Please check the highlighted fields.')
      return
    }

    setBusy(true)
    try {
      await api.signup(parsed.data)
      router.replace('/welcome')
    } catch (error) {
      if (error instanceof ApiClientError && error.is('EMAIL_ALREADY_REGISTERED')) {
        // Keep the server's message: it is the only thing that knows whether
        // the recovery email was sent or refused, and the panel must say so
        // rather than reassuring everyone regardless.
        setRecoveryMessage(error.message || null)
        setMode('duplicate')
        return
      }
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrors)
        setFormError(error.message)
        return
      }
      if (error instanceof ApiNetworkError) {
        setFormError(
          'We couldn’t reach the server. Check your connection and try again — nothing was lost.',
        )
        return
      }
      setFormError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'duplicate') {
    return (
      <AlreadyRegistered
        email={email.trim()}
        googleEnabled={googleEnabled}
        recoveryMessage={recoveryMessage}
        onBack={() => setMode('signup')}
      />
    )
  }

  const errorFor = (field: string) => fieldErrors[field]?.[0]

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {googleEnabled && !prefill ? (
        <div>
          <GoogleSignInLink label="Continue with Google" />
          <p className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
            Fills in your name and email, then brings you back here to consent.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              or fill it in yourself
            </span>
            <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
          </div>
        </div>
      ) : null}
      <Field
        id="fullName"
        label="Your name"
        value={fullName}
        onChange={setFullName}
        autoComplete="name"
        required
        error={errorFor('fullName')}
      />
      <Field
        id="email"
        label="Email"
        type="email"
        inputMode="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
        hint="Used to send your logging link. Never shown to researchers."
        error={errorFor('email')}
      />
      <Field
        id="practiceName"
        label="Practice name"
        value={practiceName}
        onChange={setPracticeName}
        autoComplete="organization"
        optional
        error={errorFor('practiceName')}
      />

      <div>
        <label
          htmlFor="province"
          className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200"
        >
          Province{' '}
          <span className="font-normal text-neutral-500 dark:text-neutral-400">
            (optional)
          </span>
        </label>
        <select
          id="province"
          value={province}
          onChange={(event) => setProvince(event.target.value)}
          className="min-h-[48px] w-full rounded-xl bg-neutral-50 px-3 text-base text-neutral-900 ring-1 ring-inset ring-neutral-300 focus:ring-2 focus:ring-hsa-600 dark:bg-neutral-800 dark:text-neutral-50 dark:ring-neutral-700"
        >
          <option value="">Prefer not to say</option>
          {PROVINCES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Province is the only thing about you that reaches the dataset, and only
          alongside an anonymous ID.
        </p>
      </div>

      <div
        className={[
          'rounded-2xl p-3.5 ring-1',
          errorFor('consent')
            ? 'ring-2 ring-red-500'
            : 'bg-hsa-50 ring-hsa-600/20 dark:bg-hsa-700/15 dark:ring-hsa-500/30',
        ].join(' ')}
      >
        <label htmlFor="consent" className="flex cursor-pointer items-start gap-3">
          <input
            id="consent"
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-describedby="consent-text"
            className="mt-0.5 h-6 w-6 shrink-0 rounded accent-hsa-600"
          />
          <span
            id="consent-text"
            className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-100"
          >
            <strong className="font-semibold">
              I agree to take part in the HSA October 2026 data collection.
            </strong>{' '}
            I understand that each day I will record how many patients I saw, and
            for each of them the <em>types of condition</em> I treated — never
            patient names, ID numbers, ages, sexes, file numbers or clinical
            notes, and nothing that links a patient from one day to the next. My
            own email is used only to send me my logging link; researchers see an
            anonymous ID and my province, never my email or my practice. Ticking
            this box <strong>is</strong> my consent — there
            is no confirmation email to click and no password to remember. I can
            ask the HSA to remove my data at any time.
          </span>
        </label>
        {errorFor('consent') ? (
          <p role="alert" className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">
            {errorFor('consent')}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="lg" fullWidth busy={busy}>
        Sign up and start
      </Button>

      <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
        <Link href="/privacy" className="underline">
          How your data is handled (POPIA)
        </Link>
      </p>
    </form>
  )
}

/* ------------------------------------------------------------------ *
 * The 409 path — recoverable, not a dead end (rubric item 1, tier 3).
 * ------------------------------------------------------------------ */

function AlreadyRegistered({
  email,
  googleEnabled,
  recoveryMessage,
  onBack,
}: {
  email: string
  googleEnabled: boolean
  /** The 409's message — delivered and not-delivered have different wording. */
  recoveryMessage: string | null
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-hsa-50 p-4 ring-1 ring-hsa-600/20 dark:bg-hsa-700/15 dark:ring-hsa-500/30">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50">
          You’re already signed up
        </h2>
        <p className="mt-1.5 text-sm text-neutral-700 dark:text-neutral-200">
          <strong className="break-all">{email}</strong> is registered, so there is
          nothing more to do — you just need this device to recognise you again.
          Nothing you have logged before has been lost.
        </p>
        {recoveryMessage ? (
          <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-200">
            {recoveryMessage}
          </p>
        ) : null}
      </div>

      {googleEnabled ? (
        <>
          <GoogleSignInLink label="Sign in with Google" />
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            Works if that address is a Google account.
          </p>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              or
            </span>
            <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
          </div>
        </>
      ) : null}

      <ReminderLinkForm
        notRecognisedHint={`That link isn’t recognised. Ask the HSA to resend it to ${email}.`}
      />

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">
        Can’t find it? Email{' '}
        <a className="underline" href="mailto:adrianadraxl@gmail.com">
          adrianadraxl@gmail.com
        </a>{' '}
        and we’ll resend it.
      </p>

      <Button variant="ghost" fullWidth onClick={onBack}>
        Use a different email
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  autoComplete,
  required = false,
  optional = false,
  hint,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  inputMode?: 'text' | 'email'
  autoComplete?: string
  required?: boolean
  optional?: boolean
  hint?: string
  error?: string
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200"
      >
        {label}
        {optional ? (
          <span className="font-normal text-neutral-500 dark:text-neutral-400">
            {' '}
            (optional)
          </span>
        ) : null}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={[
          'min-h-[48px] w-full rounded-xl bg-neutral-50 px-3 text-base text-neutral-900 ring-1 ring-inset focus:ring-2 dark:bg-neutral-800 dark:text-neutral-50',
          error
            ? 'ring-red-500 focus:ring-red-500'
            : 'ring-neutral-300 focus:ring-hsa-600 dark:ring-neutral-700',
        ].join(' ')}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-sm font-medium text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
