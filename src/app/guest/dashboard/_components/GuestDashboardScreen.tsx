'use client'

/**
 * The research dashboard as a guest sees it: the real screen's filter bar,
 * cards, charts and table, drawn from made-up sample data.
 *
 * This is a separate component from DashboardScreen on purpose. That one is
 * the researchers' gate onto the October dataset — session checks, 401/403
 * handling, live requests — and none of it belongs here. Keeping the two apart
 * means guest mode cannot weaken the real dashboard's checks, and the real
 * dashboard cannot start serving this one's sample. What they share is only
 * the presentational components, which take data and draw it.
 *
 * The sample is generated synchronously, so there are no loading or error
 * states beyond the one filter refusal the server would also make (from > to).
 * The figures still wait for the first client render, exactly as the real
 * dashboard's do: recharts measures a container the server does not have, and
 * Node and the browser do not always agree on how `en-ZA` formats a number or
 * a date, which would otherwise be a hydration mismatch on every cell.
 *
 * OWNER: Stream 2.
 */
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { DashboardCharts } from '@/app/(researcher)/dashboard/_components/DashboardCharts'
import { EntriesTable } from '@/app/(researcher)/dashboard/_components/EntriesTable'
import { FilterBar } from '@/app/(researcher)/dashboard/_components/FilterBar'
import { ResearcherShell } from '@/app/(researcher)/dashboard/_components/ResearcherShell'
import { SummaryCards } from '@/app/(researcher)/dashboard/_components/SummaryCards'
import type { DashboardQuery } from '@/lib/client'
import {
  parseSampleFilter,
  sampleEntries,
  sampleSummary,
  sampleTaxonomy,
} from '@/lib/client/demo/sample-dashboard'

/** Same page size as the real dashboard, so the table looks the same. */
const PAGE_SIZE = 50

export function GuestDashboardScreen() {
  const [filter, setFilter] = useState<DashboardQuery>({})
  const [page, setPage] = useState(1)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const taxonomy = useMemo(() => sampleTaxonomy(), [])

  const parsed = useMemo(() => parseSampleFilter(filter), [filter])
  const summary = useMemo(() => (parsed.ok ? sampleSummary(parsed.filter) : null), [parsed])
  const entries = useMemo(
    () => (parsed.ok ? sampleEntries({ ...parsed.filter, page, pageSize: PAGE_SIZE }) : null),
    [parsed, page],
  )

  const applyPatch = useCallback((patch: DashboardQuery) => {
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

  return (
    <ResearcherShell demo subtitle="Guest mode">
      <div className="space-y-4">
        <div
          role="note"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <p className="font-semibold">You are looking at made-up sample data.</p>
          <p className="mt-1">
            Every number, chart and row below is generated for demonstration —
            twelve imaginary practitioners (<code>SAMPLE-01</code> to{' '}
            <code>SAMPLE-12</code>) over an imaginary October. It is not the HSA’s
            data, and no real practitioner or patient is behind any of it. The
            filters work exactly as they do for the research team.
          </p>
          <p className="mt-2">
            <Link href="/guest/log" className="font-semibold underline">
              Try the daily log
            </Link>{' '}
            to see where entries like these come from.
          </p>
        </div>

        <FilterBar
          value={filter}
          onChange={applyPatch}
          onReset={reset}
          taxonomy={taxonomy}
          busy={false}
        />

        {!parsed.ok ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          >
            {parsed.message}
          </div>
        ) : null}

        {!mounted ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            Loading sample figures…
          </div>
        ) : null}

        {mounted && summary ? (
          <>
            <SummaryCards summary={summary} />
            <DashboardCharts summary={summary} />
          </>
        ) : null}

        {mounted && entries ? (
          <EntriesTable entries={entries} onPageChange={setPage} busy={false} />
        ) : null}
      </div>
    </ResearcherShell>
  )
}
