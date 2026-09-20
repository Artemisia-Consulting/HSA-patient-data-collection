'use client'

/**
 * The research dashboard (FR8).
 *
 * Everything here is read-only and aggregate. The screen holds one filter
 * object; the summary and the entry table are two views of it, and the CSV
 * export is a third, so the three can never disagree about what is being
 * looked at.
 *
 * Access is settled twice, and the second time is the one that counts: this
 * component hides itself from a practitioner, and `requireResearcher` on every
 * one of the three routes refuses them. The check here is courtesy — it turns
 * a 403 into a sentence — not security.
 *
 * OWNER: Stream 2.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  DashboardEntriesResponse,
  DashboardSummary,
  TaxonomyResponse,
} from '@/lib/contract/api'
import { ApiClientError, ApiNetworkError, api, type DashboardQuery } from '@/lib/client'
import { useSession } from '@/components/session/useSession'

import { DashboardCharts } from './DashboardCharts'
import { EntriesTable } from './EntriesTable'
import { FilterBar } from './FilterBar'
import { ResearcherShell } from './ResearcherShell'
import { SummaryCards } from './SummaryCards'

/**
 * Fifty rows is about a screen and a half on a laptop — enough to scan for a
 * pattern, small enough that changing a filter feels immediate. The CSV is
 * there for anyone who wants all of it.
 */
const PAGE_SIZE = 50

function Panel({ tone, children }: { tone: 'info' | 'error'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={[
        'rounded-2xl border p-5 text-sm',
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200'
          : 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function DashboardScreen() {
  const router = useRouter()
  const session = useSession()

  const [filter, setFilter] = useState<DashboardQuery>({})
  const [page, setPage] = useState(1)

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [entries, setEntries] = useState<DashboardEntriesResponse | null>(null)
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null)

  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  // Filters can change faster than the network answers. Each load stamps its
  // own sequence number so a slow earlier reply cannot overwrite a fast later one.
  const summarySeq = useRef(0)
  const entriesSeq = useRef(0)

  const isResearcher = session.practitioner?.role === 'RESEARCHER'

  /** Turns a failed load into something the screen can show. */
  const handleFailure = useCallback(
    (cause: unknown) => {
      if (cause instanceof ApiClientError) {
        if (cause.status === 401) {
          router.replace('/researcher-signin')
          return
        }
        if (cause.status === 403) {
          setForbidden(true)
          return
        }
        setError(cause.message)
        return
      }
      if (cause instanceof ApiNetworkError) {
        setError('Could not reach the server. Check the connection and try again.')
        return
      }
      setError('Something went wrong loading the dashboard.')
    },
    [router],
  )

  useEffect(() => {
    if (session.status === 'anonymous') router.replace('/researcher-signin')
  }, [session.status, router])

  // The taxonomy is a static reference list and needs no session, so it loads
  // once and is never refetched as filters change.
  useEffect(() => {
    let live = true
    void api
      .getTaxonomy()
      .then((result) => {
        if (live) setTaxonomy(result)
      })
      .catch(() => {
        // A missing taxonomy costs the condition dropdown and nothing else.
      })
    return () => {
      live = false
    }
  }, [])

  // `filter` only gets a new identity when the researcher changes something,
  // so this is a filter-changed effect rather than a render-changed one.
  useEffect(() => {
    if (!isResearcher) return
    const seq = ++summarySeq.current
    setLoadingSummary(true)
    void api
      .getDashboardSummary(filter)
      .then((result) => {
        if (seq !== summarySeq.current) return
        setSummary(result)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (seq !== summarySeq.current) return
        handleFailure(cause)
      })
      .finally(() => {
        if (seq === summarySeq.current) setLoadingSummary(false)
      })
  }, [filter, isResearcher, handleFailure])

  useEffect(() => {
    if (!isResearcher) return
    const seq = ++entriesSeq.current
    setLoadingEntries(true)
    void api
      .getDashboardEntries({ ...filter, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (seq !== entriesSeq.current) return
        setEntries(result)
      })
      .catch((cause: unknown) => {
        if (seq !== entriesSeq.current) return
        handleFailure(cause)
      })
      .finally(() => {
        if (seq === entriesSeq.current) setLoadingEntries(false)
      })
  }, [filter, page, isResearcher, handleFailure])

  const applyPatch = useCallback((patch: DashboardQuery) => {
    // Any filter change invalidates the page number: page 7 of the old result
    // set is very unlikely to exist in the new one.
    setPage(1)
    setFilter((current) => {
      const next: DashboardQuery = { ...current, ...patch }
      for (const [key, value] of Object.entries(next)) {
        if (value === '' || value === null || value === undefined) {
          delete next[key as keyof DashboardQuery]
        }
      }
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setPage(1)
    setFilter({})
  }, [])

  const busy = loadingSummary || loadingEntries

  if (session.status === 'loading') {
    return (
      <ResearcherShell>
        <Panel tone="info">Loading…</Panel>
      </ResearcherShell>
    )
  }

  if (session.status === 'offline') {
    return (
      <ResearcherShell>
        <Panel tone="error">
          No connection. The dashboard reads live aggregates, so it has nothing
          cached to show — reconnect and reload.
        </Panel>
      </ResearcherShell>
    )
  }

  if (session.status === 'anonymous') {
    return (
      <ResearcherShell>
        <Panel tone="info">Taking you to sign in…</Panel>
      </ResearcherShell>
    )
  }

  if (!isResearcher || forbidden) {
    return (
      <ResearcherShell subtitle={session.practitioner?.fullName ?? undefined}>
        <Panel tone="info">
          <p className="font-semibold">This area is for the HSA research team.</p>
          <p className="mt-2">
            You are signed in as a practitioner. Your own log is where your
            entries live.
          </p>
          <Link
            href="/log"
            className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-hsa-600 px-4 text-sm font-semibold text-white hover:bg-hsa-700"
          >
            Go to my log
          </Link>
        </Panel>
      </ResearcherShell>
    )
  }

  return (
    <ResearcherShell subtitle={session.practitioner?.fullName ?? undefined}>
      <div className="space-y-4">
        <FilterBar
          value={filter}
          onChange={applyPatch}
          onReset={reset}
          taxonomy={taxonomy}
          exportUrl={api.dashboardExportUrl(filter)}
          busy={busy}
        />

        {error ? <Panel tone="error">{error}</Panel> : null}

        {summary ? (
          <>
            <SummaryCards summary={summary} />
            <DashboardCharts summary={summary} />
          </>
        ) : (
          <Panel tone="info">{loadingSummary ? 'Loading figures…' : 'No figures yet.'}</Panel>
        )}

        {entries ? (
          <EntriesTable entries={entries} onPageChange={setPage} busy={loadingEntries} />
        ) : null}
      </div>
    </ResearcherShell>
  )
}
