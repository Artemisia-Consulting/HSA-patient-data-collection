'use client'

/**
 * First-login onboarding (FR2, user story 2.2, rubric item 3).
 *
 * Three short cards and then the thing that makes it tier 3: a **practice
 * entry**. Reading that you will log counts and conditions is not the same as
 * having done it once; the point of this screen is that on the evening of
 * 1 October the flow is already familiar and nobody is learning the form while
 * tired.
 *
 * The practice entry runs the real `DailyLogForm` in practice mode — same
 * components, same taps, same confirmation — but never calls the API and never
 * writes a draft. It is a rehearsal, not a sandbox with different rules.
 *
 * Shown once: `/` routes past it as soon as `onboardedAt` is set, and it is
 * skippable from every step for anyone who lands here again.
 *
 * OWNER: Stream 2.
 */
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { DailyLogForm } from '@/components/log/DailyLogForm'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/client'

interface OnboardingFlowProps {
  firstName: string
  today: string
}

const STEPS = [
  {
    icon: '🗓️',
    title: 'Two numbers, most evenings',
    body: (
      <>
        Every working day in October you’ll log{' '}
        <strong>how many new patients</strong> and{' '}
        <strong>how many follow-ups</strong> you saw. That alone is a complete
        entry — the rest is optional.
      </>
    ),
  },
  {
    icon: '🩺',
    title: 'Then what you treated',
    body: (
      <>
        Pick a category — Mental Health, Women’s Health &amp; Hormones,
        Communicable, Non-communicable/Chronic, or Other — and tap the conditions
        you saw. For each one we ask how you arrived at it and whether a GP is
        involved. Those three are <strong>already answered</strong> for you and
        take a tap only if you disagree.
      </>
    ),
  },
  {
    icon: '🔒',
    title: 'Nothing about the patient',
    body: (
      <>
        No names, no ID numbers, no clinical notes — there is nowhere to type
        them. Researchers see an anonymous practitioner ID and your province, and
        never your email. That is what keeps this POPIA-compliant without asking
        anything of you.
      </>
    ),
  },
] as const

export function OnboardingFlow({ firstName, today }: OnboardingFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [practising, setPractising] = useState(false)
  const [finishing, setFinishing] = useState(false)

  async function finish() {
    setFinishing(true)
    try {
      await api.markOnboarded()
    } catch {
      // Not worth blocking on: worst case they see this screen once more.
    } finally {
      router.replace('/log')
    }
  }

  if (practising) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setPractising(false)}
          className="mb-3 min-h-[44px] text-sm font-semibold text-hsa-700 underline dark:text-hsa-100"
        >
          ← Back to the walkthrough
        </button>
        <DailyLogForm today={today} practice onFinishPractice={() => void finish()} />
      </div>
    )
  }

  const isLast = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex-1">
        <p className="text-sm font-medium text-hsa-700 dark:text-hsa-100">
          Welcome, {firstName}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Here’s what October looks like
        </h1>

        <div className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <span aria-hidden="true" className="text-3xl">
            {current.icon}
          </span>
          <h2 className="mt-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">
            {current.title}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-200">
            {current.body}
          </p>
        </div>

        <ol
          aria-label={`Step ${step + 1} of ${STEPS.length}`}
          className="mt-4 flex justify-center gap-2"
        >
          {STEPS.map((item, index) => (
            <li
              key={item.title}
              aria-current={index === step ? 'step' : undefined}
              className={[
                'h-2 w-8 rounded-full',
                index === step
                  ? 'bg-hsa-600'
                  : 'bg-neutral-200 dark:bg-neutral-700',
              ].join(' ')}
            />
          ))}
        </ol>
      </div>

      <div className="mt-6 space-y-2">
        {isLast ? (
          <>
            <Button size="lg" fullWidth onClick={() => setPractising(true)}>
              Try a practice entry
            </Button>
            <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
              Nothing is saved or sent — it’s a dry run.
            </p>
            <Button variant="secondary" fullWidth busy={finishing} onClick={() => void finish()}>
              I’m ready, take me to the log
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" fullWidth onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
            <Button variant="ghost" fullWidth onClick={() => void finish()}>
              Skip
            </Button>
          </>
        )}

        {step > 0 && !isLast ? null : null}
      </div>
    </div>
  )
}
