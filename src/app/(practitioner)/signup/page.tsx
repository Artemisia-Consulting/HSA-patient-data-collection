/**
 * Signup (FR1). See `SignupForm` for why the consent tick is the consent
 * record and how the duplicate-email path recovers.
 *
 * OWNER: Stream 2.
 */
import type { Metadata } from 'next'

import { AppShell } from '@/components/shell/AppShell'
import { SignupForm } from '@/components/signup/SignupForm'

export const metadata: Metadata = {
  title: 'Sign up · HSA Daily Patient Log',
  description:
    'Join the Homoeopathic Association of South Africa’s October 2026 patient data collection.',
}

export default function SignupPage() {
  return (
    <AppShell showNav={false}>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
        Sign up once
      </h1>
      <p className="mt-1.5 mb-5 text-[15px] text-neutral-600 dark:text-neutral-300">
        No password, no confirmation email. After this, opening your link goes
        straight to the log form.
      </p>
      <SignupForm />
    </AppShell>
  )
}
