/**
 * /researcher-signin — the way into the research dashboard.
 *
 * The form is a client component; this wrapper exists so the screen can carry
 * its own `metadata`, which a `'use client'` page cannot export. `noindex`:
 * there is nothing here for a search engine, and an indexed sign-in page is
 * just an invitation to guess at the code.
 *
 * OWNER: Stream 2.
 */
import type { Metadata } from 'next'

import { ResearcherSignInForm } from './_components/ResearcherSignInForm'

export const metadata: Metadata = {
  title: 'Researcher sign-in — HSA Daily Patient Log',
  description: 'Sign in to the HSA research dashboard.',
  robots: { index: false, follow: false },
}

export default function ResearcherSignInPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">Researcher sign-in</h1>
      <p className="mt-2 mb-6 text-sm opacity-75">
        For the HSA research team. Practitioners do not need this — your own log
        opens straight from your reminder link.
      </p>

      <ResearcherSignInForm />
    </main>
  )
}
