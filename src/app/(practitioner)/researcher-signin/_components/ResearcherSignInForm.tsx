'use client'

/**
 * /researcher-signin — the shared-code door into the research dashboard.
 *
 * A temporary development measure, and deliberately the smallest one that is
 * not dangerous: the code is rate limited, compared in constant time, and
 * refused outright in production unless `RESEARCHER_CODE` is set. It exists so
 * the dashboard can be used before per-researcher sign-in is wired up, and it
 * should be removed when that lands.
 *
 * This screen goes through `api.signInAsResearcher` like every other call in
 * the app. The previous version called `fetch` directly and wrote the token to
 * `hsa.session`, a key nothing reads — so the sign-in appeared to work and the
 * next request was anonymous.
 *
 * OWNER: Stream 2.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { ApiClientError, ApiNetworkError, api } from '@/lib/client'

export function ResearcherSignInForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)

    try {
      const session = await api.signInAsResearcher(code.trim())
      if (session.practitioner.role !== 'RESEARCHER') {
        // The route should never issue a non-researcher session here, but the
        // dashboard is the wrong place to discover that if it ever did.
        setError('That account is not a research account.')
        return
      }
      router.replace('/dashboard')
      router.refresh()
    } catch (cause) {
      if (cause instanceof ApiNetworkError) {
        setError('Could not reach the server. Check the connection and try again.')
      } else if (cause instanceof ApiClientError) {
        setError(cause.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="code" className="mb-1 block text-sm font-medium">
            Researcher code
          </label>
          <input
            id="code"
            name="code"
            type="password"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 focus:border-hsa-600 focus:outline-2 focus:outline-offset-1 focus:outline-hsa-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            placeholder="Enter the code provided by HSA"
            required
            autoFocus
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" busy={busy} fullWidth size="lg">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-sm opacity-75">
        Not a researcher?{' '}
        <Link href="/signup" className="font-medium text-hsa-700 underline dark:text-hsa-100">
          Practitioner sign-up
        </Link>
      </p>
    </>
  )
}
