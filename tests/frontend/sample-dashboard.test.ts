/**
 * The guest dashboard's made-up dataset.
 *
 * Two things matter. First, it must be the same *shape* as the real thing —
 * every output is parsed with the contract's own schema, so the presentational
 * components the guest screen shares with the research dashboard can never
 * receive something they were not written for. Second, it must be
 * unmistakably sample data and never touch the network, because the whole
 * point of guest mode is that a stranger sees nothing real.
 *
 * OWNER: Stream 2.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  dashboardEntriesResponseSchema,
  dashboardSummarySchema,
  taxonomyResponseSchema,
  type DashboardFilter,
} from '@/lib/contract/api'
import {
  parseSampleFilter,
  sampleEntries,
  sampleSummary,
  sampleTaxonomy,
} from '@/lib/client/demo/sample-dashboard'

/** Parse a UI query, failing the test if the filter is refused. */
function filter(query: Record<string, string | number> = {}): DashboardFilter {
  const result = parseSampleFilter(query)
  if (!result.ok) throw new Error(`filter refused: ${result.message}`)
  return result.filter
}

/** Every row in scope, across all pages. */
function collect(query: Record<string, string | number>) {
  const first = sampleEntries(filter({ ...query, pageSize: 500 }))
  const rows = [...first.rows]
  const pages = Math.ceil(first.totalRows / 500)
  for (let page = 2; page <= pages; page += 1) {
    rows.push(...sampleEntries(filter({ ...query, pageSize: 500, page })).rows)
  }
  return rows
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sample dashboard — contract shape', () => {
  it('produces a summary that satisfies the contract with no filter', () => {
    const summary = sampleSummary(filter())
    expect(() => dashboardSummarySchema.parse(summary)).not.toThrow()
    expect(summary.totals.totalPatients).toBeGreaterThan(0)
  })

  it('produces entries that satisfy the contract', () => {
    const entries = sampleEntries(filter({ pageSize: 50 }))
    expect(() => dashboardEntriesResponseSchema.parse(entries)).not.toThrow()
    expect(entries.rows).toHaveLength(50)
  })

  it('serves a contract-shaped taxonomy without a request', () => {
    expect(() => taxonomyResponseSchema.parse(sampleTaxonomy())).not.toThrow()
  })

  it('stays contract-shaped under every kind of filter', () => {
    const queries: Record<string, string>[] = [
      { category: 'MENTAL_HEALTH' },
      { patientType: 'new' },
      { patientType: 'followup', referredByGp: 'YES' },
      { from: '2026-10-05', to: '2026-10-09' },
      { diagnosisBasis: 'PATIENT_REPORTED_PRIOR', alsoSeeingGp: 'NO' },
      { conditionCode: 'MH_ANXIETY' },
    ]
    for (const query of queries) {
      expect(() => dashboardSummarySchema.parse(sampleSummary(filter(query)))).not.toThrow()
      expect(() =>
        dashboardEntriesResponseSchema.parse(sampleEntries(filter(query))),
      ).not.toThrow()
    }
  })
})

describe('sample dashboard — clearly not real', () => {
  it('labels every practitioner and row id as sample data', () => {
    for (const row of collect({})) {
      expect(row.practitionerId).toMatch(/^SAMPLE-\d{2}$/)
      expect(row.logId).toMatch(/^sample-/)
      if (row.patientId) expect(row.patientId).toMatch(/^sample-/)
    }
  })

  it('never makes a network request', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    sampleSummary(filter({ category: 'COMMUNICABLE' }))
    sampleEntries(filter({ page: 2 }))
    sampleTaxonomy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is deterministic, so a screenshot is reproducible', () => {
    expect(sampleSummary(filter())).toEqual(sampleSummary(filter()))
  })

  it('shows a realistic participation rate rather than everyone reporting', () => {
    const { totals } = sampleSummary(filter())
    expect(totals.practitioners).toBe(12)
    expect(totals.practitionersReporting).toBe(10)
  })

  it('leaves out free-text "Other (specify)" rows, which a sample cannot invent', () => {
    expect(collect({}).some((row) => row.conditionCode?.endsWith('__OTHER'))).toBe(false)
  })
})

describe('sample dashboard — the same filter rules as the server', () => {
  it('agrees with itself: summary totals match the rows', () => {
    const summary = sampleSummary(filter())
    const rows = collect({})
    const patients = new Set(rows.map((row) => row.patientId))
    expect(patients.size).toBe(summary.totals.totalPatients)
    expect(rows.filter((row) => row.conditionCode !== null)).toHaveLength(
      summary.totals.conditionEntries,
    )
  })

  it('keeps only the chosen category', () => {
    const rows = collect({ category: 'WOMENS_HEALTH_HORMONES' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.category === 'WOMENS_HEALTH_HORMONES')).toBe(true)

    const summary = sampleSummary(filter({ category: 'WOMENS_HEALTH_HORMONES' }))
    for (const bar of summary.byCategory) {
      if (bar.category !== 'WOMENS_HEALTH_HORMONES') expect(bar.entries).toBe(0)
    }
  })

  it('filters patients by type', () => {
    const rows = collect({ patientType: 'new' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.patientType === 'NEW')).toBe(true)
    expect(sampleSummary(filter({ patientType: 'new' })).totals.followUpPatients).toBe(0)
  })

  it('applies patient type and a condition filter to the same patient', () => {
    const rows = collect({ patientType: 'followup', referredByGp: 'YES' })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.patientType).toBe('FOLLOW_UP')
      expect(row.referredByGp).toBe('YES')
    }
  })

  it('bounds the date range inclusively', () => {
    const rows = collect({ from: '2026-10-05', to: '2026-10-09' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.logDate >= '2026-10-05' && row.logDate <= '2026-10-09')).toBe(
      true,
    )
    const dates = sampleSummary(filter({ from: '2026-10-05', to: '2026-10-09' })).byDate
    expect(dates.map((day) => day.logDate)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ])
  })

  it('has no Sunday entries, like a real working month', () => {
    // 4 October 2026 is a Sunday.
    expect(collect({ from: '2026-10-04', to: '2026-10-04' })).toHaveLength(0)
  })

  it('pages the rows', () => {
    const first = sampleEntries(filter({ page: 1, pageSize: 10 }))
    const second = sampleEntries(filter({ page: 2, pageSize: 10 }))
    expect(second.page).toBe(2)
    expect(second.rows).toHaveLength(10)
    expect(second.rows[0]).not.toEqual(first.rows[0])
    expect(second.totalRows).toBe(first.totalRows)
  })

  it('refuses a "from" after "to", as the server does', () => {
    const result = parseSampleFilter({ from: '2026-10-20', to: '2026-10-10' })
    expect(result.ok).toBe(false)
  })

  it('refuses a value outside the enums', () => {
    expect(parseSampleFilter({ category: 'NOT_A_CATEGORY' }).ok).toBe(false)
  })

  it('treats blank values as "no filter"', () => {
    expect(sampleSummary(filter({ category: '', from: '' }))).toEqual(sampleSummary(filter()))
  })
})
