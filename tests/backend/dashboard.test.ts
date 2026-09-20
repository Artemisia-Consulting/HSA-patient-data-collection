import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createPractitioner, initTestDb, issueSession, resetDb } from './helpers/db'
import { apiRequest, readJson } from './helpers/request'

import {
  apiErrorSchema,
  dashboardEntriesResponseSchema,
  dashboardEntryRowSchema,
  dashboardSummarySchema,
  otherConditionCode,
} from '@/lib/contract'
import { prisma } from '@/lib/db'
import { GET as summary } from '@/app/api/dashboard/summary/route'
import { GET as entries } from '@/app/api/dashboard/entries/route'
import { GET as exportCsv, EXPORT_COLUMNS } from '@/app/api/dashboard/export/route'

let researcherToken: string
let practitionerToken: string
let practitionerA: { id: string; email: string }
let practitionerB: { id: string; email: string }

/** `count` patients of one type with nothing itemised, numbered from `from`. */
const blankPatients = (patientType: 'NEW' | 'FOLLOW_UP', count: number, from: number) =>
  Array.from({ length: count }, (_, i) => ({ patientType, position: from + i }))

beforeAll(async () => {
  await initTestDb()
})

beforeEach(async () => {
  await resetDb()

  const researcher = await createPractitioner({
    email: 'research@hsa.org.za',
    role: 'RESEARCHER',
  })
  researcherToken = await issueSession(researcher.id)

  practitionerA = await createPractitioner({
    email: 'nomsa@example.org',
    province: 'Gauteng',
  })
  practitionerB = await createPractitioner({
    email: 'pieter@example.org',
    province: 'Western Cape',
  })
  practitionerToken = await issueSession(practitionerA.id)

  // 12 patients over 3 days, 3 conditions itemised between them.
  //
  // Both of the 1 October conditions sit on the *same* new patient. That is the
  // case the day-level model could not express, and it is what makes
  // `patientsWithMultipleConditions` and the per-patient filters testable.
  await prisma.dailyLog.create({
    data: {
      practitionerId: practitionerA.id,
      logDate: '2026-10-01',
      newPatients: 5,
      followUpPatients: 2,
      patients: {
        create: [
          {
            patientType: 'NEW',
            position: 1,
            conditions: {
              create: [
                {
                  category: 'MENTAL_HEALTH',
                  conditionCode: 'MH_ANXIETY',
                  diagnosisBasis: 'CLINICAL_DIAGNOSIS',
                  alsoSeeingGp: 'YES',
                  referredByGp: 'YES',
                },
                {
                  category: 'COMMUNICABLE',
                  conditionCode: 'CD_TB',
                  diagnosisBasis: 'PATIENT_REPORTED_PRIOR',
                  alsoSeeingGp: 'NO',
                  referredByGp: 'NO',
                },
              ],
            },
          },
          // Seen, nothing itemised.
          ...blankPatients('NEW', 4, 2),
          ...blankPatients('FOLLOW_UP', 2, 1),
        ],
      },
    },
  })

  // A day where everyone was seen but nothing was itemised — it must still
  // reach the export.
  await prisma.dailyLog.create({
    data: {
      practitionerId: practitionerA.id,
      logDate: '2026-10-02',
      newPatients: 0,
      followUpPatients: 3,
      patients: { create: blankPatients('FOLLOW_UP', 3, 1) },
    },
  })

  await prisma.dailyLog.create({
    data: {
      practitionerId: practitionerB.id,
      logDate: '2026-10-02',
      newPatients: 1,
      followUpPatients: 1,
      patients: {
        create: [
          {
            patientType: 'NEW',
            position: 1,
            conditions: {
              create: [
                {
                  category: 'WOMENS_HEALTH_HORMONES',
                  conditionCode: 'WH_MENOPAUSE',
                  diagnosisBasis: 'PRESENTING_COMPLAINT_ONLY',
                  alsoSeeingGp: 'UNSURE',
                  referredByGp: 'NOT_APPLICABLE',
                },
              ],
            },
          },
          ...blankPatients('FOLLOW_UP', 1, 1),
        ],
      },
    },
  })
})

describe('role-based access (rubric item 14, tier 3)', () => {
  const routes: Array<[string, typeof summary]> = [
    ['/api/dashboard/summary', summary],
    ['/api/dashboard/entries', entries],
    ['/api/dashboard/export', exportCsv],
  ]

  it.each(routes)('401s on %s without a session', async (path, handler) => {
    const response = await handler(apiRequest(path), undefined)
    expect(response.status).toBe(401)
  })

  it.each(routes)('403s on %s for a practitioner', async (path, handler) => {
    const response = await handler(apiRequest(path, { token: practitionerToken }), undefined)
    expect(response.status).toBe(403)
    const body = apiErrorSchema.parse(await readJson(response))
    expect(body.error.code).toBe('FORBIDDEN')
    // The refusal must not say why, or who, or what is behind it.
    expect(body.error.message).not.toContain('@')
  })
})

describe('GET /api/dashboard/summary (FR8)', () => {
  it('totals every scoped log', async () => {
    const response = await summary(
      apiRequest('/api/dashboard/summary', { token: researcherToken }),
      undefined,
    )
    expect(response.status).toBe(200)

    const body = dashboardSummarySchema.parse(await readJson(response))
    expect(body.totals).toEqual({
      practitioners: 2,
      practitionersReporting: 2,
      logDays: 3,
      newPatients: 6,
      followUpPatients: 6,
      totalPatients: 12,
      conditionEntries: 3,
    })
  })

  it('returns a daily series for the trend chart', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary', { token: researcherToken }),
          undefined,
        ),
      ),
    )
    expect(body.byDate).toEqual([
      { logDate: '2026-10-01', newPatients: 5, followUpPatients: 2 },
      { logDate: '2026-10-02', newPatients: 1, followUpPatients: 4 },
    ])
  })

  it('always reports all five categories, zeros included', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary', { token: researcherToken }),
          undefined,
        ),
      ),
    )
    expect(body.byCategory).toHaveLength(5)
    expect(body.byCategory.find((c) => c.category === 'MENTAL_HEALTH')?.entries).toBe(1)
    expect(body.byCategory.find((c) => c.category === 'OTHER')?.entries).toBe(0)
  })

  it('counts co-management and referral separately (rubric item 7, tier 3)', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary', { token: researcherToken }),
          undefined,
        ),
      ),
    )
    expect(body.coManagement).toEqual({
      alsoSeeingGpYes: 1,
      alsoSeeingGpNo: 1,
      alsoSeeingGpUnsure: 1,
      referredByGpYes: 1,
      referredByGpNo: 1,
      referredByGpNotApplicable: 1,
    })
  })

  it('filters by date range', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary?from=2026-10-02', { token: researcherToken }),
          undefined,
        ),
      ),
    )
    expect(body.totals.logDays).toBe(2)
    expect(body.totals.newPatients).toBe(1)
    expect(body.totals.followUpPatients).toBe(4)
  })

  it('counts patients who presented with more than one condition', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary', { token: researcherToken }),
          undefined,
        ),
      ),
    )
    expect(body.patientsWithMultipleConditions).toBe(1)
  })

  it('splits patients and entries by new vs returning', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary', { token: researcherToken }),
          undefined,
        ),
      ),
    )
    expect(body.byPatientType).toEqual([
      { patientType: 'NEW', patients: 6, entries: 3 },
      { patientType: 'FOLLOW_UP', patients: 6, entries: 0 },
    ])
  })

  it('filters by category down to the matching patients, not their whole day', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary?category=MENTAL_HEALTH', {
            token: researcherToken,
          }),
          undefined,
        ),
      ),
    )
    expect(body.totals.logDays).toBe(1)
    expect(body.totals.conditionEntries).toBe(1)
    // One patient matched — not the other four new patients seen that day, who
    // are what the day-level count would have reported.
    expect(body.totals.newPatients).toBe(1)
    expect(body.totals.followUpPatients).toBe(0)
  })

  it('filters by referral status', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary?referredByGp=YES', { token: researcherToken }),
          undefined,
        ),
      ),
    )
    expect(body.totals.conditionEntries).toBe(1)
    expect(body.coManagement.referredByGpYes).toBe(1)
    expect(body.coManagement.referredByGpNo).toBe(0)
  })

  it('filters by new vs follow-up', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary?patientType=new', { token: researcherToken }),
          undefined,
        ),
      ),
    )
    // The day with zero new patients drops out.
    expect(body.totals.logDays).toBe(2)
    expect(body.totals.newPatients).toBe(6)
    expect(body.totals.followUpPatients).toBe(0)
  })

  it('applies the patient filter and the entry filter to the same patient', async () => {
    const body = dashboardSummarySchema.parse(
      await readJson(
        await summary(
          apiRequest('/api/dashboard/summary?patientType=followup&category=MENTAL_HEALTH', {
            token: researcherToken,
          }),
          undefined,
        ),
      ),
    )
    // Anxiety was recorded, and returning patients were seen — but never the
    // same patient, so nothing matches. A day-level filter would have said 1.
    expect(body.totals.logDays).toBe(0)
    expect(body.totals.conditionEntries).toBe(0)
  })

  it('400s on a filter value that is not in the contract', async () => {
    const response = await summary(
      apiRequest('/api/dashboard/summary?category=DENTAL', { token: researcherToken }),
      undefined,
    )
    expect(response.status).toBe(400)
    expect(apiErrorSchema.parse(await readJson(response)).error.code).toBe(
      'VALIDATION_FAILED',
    )
  })

  it('400s when the range is back to front', async () => {
    const response = await summary(
      apiRequest('/api/dashboard/summary?from=2026-10-20&to=2026-10-01', {
        token: researcherToken,
      }),
      undefined,
    )
    expect(response.status).toBe(400)
  })

  it('treats an empty filter value as no filter', async () => {
    const response = await summary(
      apiRequest('/api/dashboard/summary?category=&conditionCode=', {
        token: researcherToken,
      }),
      undefined,
    )
    expect(response.status).toBe(200)
  })
})

describe('GET /api/dashboard/entries (FR8)', () => {
  it('flattens to one row per condition, keeping patients with none', async () => {
    const response = await entries(
      apiRequest('/api/dashboard/entries', { token: researcherToken }),
      undefined,
    )
    const body = dashboardEntriesResponseSchema.parse(await readJson(response))

    // 12 patients, 3 of them carrying a condition; the other 10 rows are
    // patients seen with nothing itemised, which is still a record.
    expect(body.totalRows).toBe(13)
    const empty = body.rows.filter((row) => row.conditionCode === null)
    expect(empty).toHaveLength(10)
    expect(empty.every((row) => row.patientId !== null)).toBe(true)
  })

  it('groups a multi-condition patient under one patientId', async () => {
    const body = dashboardEntriesResponseSchema.parse(
      await readJson(
        await entries(apiRequest('/api/dashboard/entries', { token: researcherToken }), undefined),
      ),
    )
    const anxiety = body.rows.find((row) => row.conditionCode === 'MH_ANXIETY')
    const tb = body.rows.find((row) => row.conditionCode === 'CD_TB')
    expect(anxiety?.patientId).toBeTruthy()
    expect(tb?.patientId).toBe(anxiety?.patientId)
    expect(anxiety?.patientType).toBe('NEW')
  })

  it('keeps a day recorded before patients were itemised', async () => {
    // Rows written by the day-level version of the app have counts and no
    // patient rows at all. They still belong in the export.
    await prisma.dailyLog.create({
      data: {
        practitionerId: practitionerB.id,
        logDate: '2026-10-05',
        newPatients: 4,
        followUpPatients: 1,
      },
    })

    const body = dashboardEntriesResponseSchema.parse(
      await readJson(
        await entries(
          apiRequest('/api/dashboard/entries?from=2026-10-05', { token: researcherToken }),
          undefined,
        ),
      ),
    )
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].patientId).toBeNull()
    expect(body.rows[0].patientType).toBeNull()
    expect(body.rows[0].newPatients).toBe(4)
  })

  it('labels conditions from the taxonomy table', async () => {
    const body = dashboardEntriesResponseSchema.parse(
      await readJson(
        await entries(
          apiRequest('/api/dashboard/entries?conditionCode=CD_TB', {
            token: researcherToken,
          }),
          undefined,
        ),
      ),
    )
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].conditionLabel).toBe('Tuberculosis (TB)')
    expect(body.rows[0].province).toBe('Gauteng')
  })

  it('pages', async () => {
    const body = dashboardEntriesResponseSchema.parse(
      await readJson(
        await entries(
          apiRequest('/api/dashboard/entries?page=2&pageSize=2', {
            token: researcherToken,
          }),
          undefined,
        ),
      ),
    )
    expect(body.page).toBe(2)
    expect(body.pageSize).toBe(2)
    expect(body.totalRows).toBe(13)
    expect(body.rows).toHaveLength(2)
  })

  it('400s on a page size beyond the cap', async () => {
    const response = await entries(
      apiRequest('/api/dashboard/entries?pageSize=5000', { token: researcherToken }),
      undefined,
    )
    expect(response.status).toBe(400)
  })

  it('never includes a practitioner email (POPIA)', async () => {
    const response = await entries(
      apiRequest('/api/dashboard/entries', { token: researcherToken }),
      undefined,
    )
    const raw = JSON.stringify(await readJson(response))

    expect(raw).not.toContain(practitionerA.email)
    expect(raw).not.toContain(practitionerB.email)
    expect(raw).not.toContain('@')
    expect(raw).toContain(practitionerA.id)
  })

  it('exposes no field the contract does not name', async () => {
    const body = dashboardEntriesResponseSchema.parse(
      await readJson(
        await entries(apiRequest('/api/dashboard/entries', { token: researcherToken }), undefined),
      ),
    )
    const allowed = Object.keys(dashboardEntryRowSchema.shape).sort()
    for (const row of body.rows) {
      expect(Object.keys(row).sort()).toEqual(allowed)
    }
  })
})

describe('GET /api/dashboard/export (FR8)', () => {
  async function csvFor(query = ''): Promise<string> {
    const response = await exportCsv(
      apiRequest(`/api/dashboard/export${query}`, { token: researcherToken }),
      undefined,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('attachment')
    return response.text()
  }

  it('writes the contract columns, in order, one row per entry', async () => {
    const csv = await csvFor()
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n')

    expect(lines[0]).toBe(EXPORT_COLUMNS.join(','))
    expect(lines).toHaveLength(14) // header + 13 rows
  })

  it('carries the patient columns, so two conditions can be tied to one visit', async () => {
    const csv = await csvFor()
    expect(EXPORT_COLUMNS).toContain('patientId')
    expect(EXPORT_COLUMNS).toContain('patientType')

    const lines = csv.replace(/^\ufeff/, '').trim().split('\r\n')
    const column = EXPORT_COLUMNS.indexOf('patientId')
    const idsOf = (code: string) =>
      lines.filter((line) => line.includes(code)).map((line) => line.split(',')[column])
    expect(idsOf('MH_ANXIETY')).toEqual(idsOf('CD_TB'))
  })

  it('opens correctly in Excel (the bytes start with a UTF-8 BOM)', async () => {
    // Checked at the byte level on purpose: Response.text() strips a leading
    // BOM per the fetch spec, so a string assertion here would always fail
    // even though the downloaded file is correct.
    const response = await exportCsv(
      apiRequest('/api/dashboard/export', { token: researcherToken }),
      undefined,
    )
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
  })

  it('honours the same filters as the table', async () => {
    const csv = await csvFor('?category=MENTAL_HEALTH')
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('MH_ANXIETY')
  })

  it('carries no practitioner email (POPIA)', async () => {
    const csv = await csvFor()
    expect(csv).not.toContain(practitionerA.email)
    expect(csv).not.toContain('@')
    expect(csv).toContain(practitionerA.id)
  })

  it('neutralises a spreadsheet formula in free text', async () => {
    const patient = await prisma.patientEntry.findFirstOrThrow({
      where: { dailyLog: { practitionerId: practitionerB.id } },
    })
    await prisma.conditionEntry.create({
      data: {
        patientEntryId: patient.id,
        category: 'OTHER',
        conditionCode: otherConditionCode('OTHER'),
        conditionOther: '=HYPERLINK("http://evil","click")',
        diagnosisBasis: 'CLINICAL_DIAGNOSIS',
        alsoSeeingGp: 'NO',
        referredByGp: 'NO',
      },
    })

    const csv = await csvFor()
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"",""click"")"')
    expect(csv).not.toContain('\n=HYPERLINK')
  })
})
