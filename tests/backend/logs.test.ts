import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPractitioner, initTestDb, issueSession, resetDb } from './helpers/db'
import { apiRequest, dateParams, readJson, sessionCookieValue } from './helpers/request'
import { conditionsOf, dayWith, logBody, patientWith } from '../helpers/log-body'

import {
  apiErrorSchema,
  dailyLogListResponseSchema,
  dailyLogSchema,
  otherConditionCode,
} from '@/lib/contract'
import { prisma } from '@/lib/db'
import { GET as getLog, PUT as putLog } from '@/app/api/logs/[date]/route'
import { GET as listLogs } from '@/app/api/logs/route'

/** Mid-collection, so writes are inside the window and not in the future. */
const TODAY = '2026-10-15'
const YESTERDAY = '2026-10-14'

const entry = {
  category: 'MENTAL_HEALTH' as const,
  conditionCode: 'MH_ANXIETY',
  diagnosisBasis: 'CLINICAL_DIAGNOSIS' as const,
  alsoSeeingGp: 'YES' as const,
  referredByGp: 'NO' as const,
}

const body = dayWith({ newPatients: 4, followUpPatients: 6, conditions: [entry] })

/**
 * One new patient carrying exactly the conditions given. Typed loosely because
 * several callers below deliberately send a condition the contract rejects.
 */
const oneNewPatientWith = (...conditions: unknown[]) => ({
  newPatients: 1,
  followUpPatients: 0,
  patients: [{ patientType: 'NEW', conditions }],
})

beforeAll(async () => {
  await initTestDb()
})

beforeEach(async () => {
  await resetDb()
  // Only Date is faked; timers stay real so Prisma's promises still settle.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T10:00:00+02:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

async function authed() {
  const practitioner = await createPractitioner()
  return { practitioner, token: await issueSession(practitioner.id) }
}

describe('PUT /api/logs/:date — access and dates (FR3)', () => {
  it('401s without a credential', async () => {
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, { method: 'PUT', body }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(401)
  })

  it('400s on a date that is not a real calendar date', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest('/api/logs/2026-02-31', { method: 'PUT', body, token }),
      dateParams('2026-02-31'),
    )
    expect(response.status).toBe(400)
    const parsed = apiErrorSchema.parse(await readJson(response))
    expect(parsed.error.fieldErrors?.date).toBeDefined()
  })

  it('400s on a date that is not a date at all', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest('/api/logs/yesterday', { method: 'PUT', body, token }),
      dateParams('yesterday'),
    )
    expect(response.status).toBe(400)
  })

  /**
   * A day before the collection opens is saved like any other. It is not part
   * of the research — it is there so the app can be used for real during
   * development and training — and it is cleared out by logDate before the
   * study starts, so nothing marks it in the row itself.
   */
  it('accepts a date before the collection window opens', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest('/api/logs/2026-09-30', { method: 'PUT', body, token }),
      dateParams('2026-09-30'),
    )
    expect(response.status).toBe(201)
    expect(await prisma.dailyLog.count({ where: { logDate: '2026-09-30' } })).toBe(1)
  })

  it('422s for a date before even the early-entry floor', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest('/api/logs/2026-01-01', { method: 'PUT', body, token }),
      dateParams('2026-01-01'),
    )
    expect(response.status).toBe(422)
    expect(apiErrorSchema.parse(await readJson(response)).error.code).toBe(
      'OUTSIDE_COLLECTION_WINDOW',
    )
  })

  it('422s for a future date inside the window', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest('/api/logs/2026-10-20', { method: 'PUT', body, token }),
      dateParams('2026-10-20'),
    )
    expect(response.status).toBe(422)
  })

  it('accepts a backdated day inside the window', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${YESTERDAY}`, { method: 'PUT', body, token }),
      dateParams(YESTERDAY),
    )
    expect(response.status).toBe(201)
  })

  it('works from a reminder link with no session, and leaves one behind', async () => {
    const practitioner = await createPractitioner()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}?k=${practitioner.reminderLinkId}`, {
        method: 'PUT',
        body,
      }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(201)
    expect(sessionCookieValue(response)).toBeTruthy()
  })
})

describe('PUT /api/logs/:date — body validation (FR3–FR6)', () => {
  const cases: Array<[string, unknown, string]> = [
    ['negative counts', { ...body, newPatients: -1 }, 'newPatients'],
    ['counts above the cap', { ...body, newPatients: 201 }, 'newPatients'],
    ['fractional counts', { ...body, followUpPatients: 2.5 }, 'followUpPatients'],
    ['a count sent as a string', { ...body, newPatients: '4' }, 'newPatients'],
    ['a missing count', { followUpPatients: 1, patients: [] }, 'newPatients'],
    [
      'an unknown diagnosis basis',
      oneNewPatientWith({ ...entry, diagnosisBasis: 'GUESSWORK' }),
      'patients.0.conditions.0.diagnosisBasis',
    ],
    [
      'an unknown category',
      oneNewPatientWith({ ...entry, category: 'DENTAL' }),
      'patients.0.conditions.0.category',
    ],
    [
      'an unknown co-management answer',
      oneNewPatientWith({ ...entry, alsoSeeingGp: 'MAYBE' }),
      'patients.0.conditions.0.alsoSeeingGp',
    ],
    [
      'an unknown patient type',
      { newPatients: 1, followUpPatients: 0, patients: [{ patientType: 'WALK_IN', conditions: [] }] },
      'patients.0.patientType',
    ],
    // The counts and the patient list are the same fact stated twice, and the
    // export is only trustworthy if they always agree.
    [
      'more patients than the count claims',
      { newPatients: 1, followUpPatients: 0, patients: [patientWith('NEW'), patientWith('NEW')] },
      'patients',
    ],
    [
      'fewer patients than the count claims',
      { newPatients: 0, followUpPatients: 3, patients: [patientWith('FOLLOW_UP')] },
      'patients',
    ],
    [
      'patients of the wrong type for the counts',
      { newPatients: 1, followUpPatients: 0, patients: [patientWith('FOLLOW_UP')] },
      'patients',
    ],
  ]

  it.each(cases)('rejects %s', async (_label, payload, field) => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, { method: 'PUT', body: payload, token }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(400)
    const parsed = apiErrorSchema.parse(await readJson(response))
    expect(parsed.error.code).toBe('VALIDATION_FAILED')
    expect(Object.keys(parsed.error.fieldErrors ?? {})).toContain(field)
  })

  it('rejects more than 20 conditions on one patient', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: logBody([patientWith('NEW', Array.from({ length: 21 }, () => entry))]),
        token,
      }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(400)
  })

  it('requires free text on an "Other (specify)" row', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: oneNewPatientWith({
          ...entry,
          conditionCode: otherConditionCode('MENTAL_HEALTH'),
        }),
        token,
      }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(400)
    const parsed = apiErrorSchema.parse(await readJson(response))
    expect(
      parsed.error.fieldErrors?.['patients.0.conditions.0.conditionOther'],
    ).toBeDefined()
  })

  it('rejects a condition code that is not in the taxonomy table', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: oneNewPatientWith({ ...entry, conditionCode: 'MH_MADE_UP' }),
        token,
      }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(400)
    const parsed = apiErrorSchema.parse(await readJson(response))
    expect(
      parsed.error.fieldErrors?.['patients.0.conditions.0.conditionCode'],
    ).toBeDefined()
  })

  it('rejects a condition filed under the wrong category', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: oneNewPatientWith({
          ...entry,
          category: 'COMMUNICABLE',
          conditionCode: 'MH_ANXIETY',
        }),
        token,
      }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(400)
    const parsed = apiErrorSchema.parse(await readJson(response))
    expect(parsed.error.fieldErrors?.['patients.0.conditions.0.category']).toBeDefined()
  })

  it('rejects a condition that has been retired from the list', async () => {
    const { token } = await authed()
    await prisma.condition.update({
      where: { code: 'MH_ANXIETY' },
      data: { isActive: false },
    })

    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, { method: 'PUT', body, token }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(400)

    await prisma.condition.update({
      where: { code: 'MH_ANXIETY' },
      data: { isActive: true },
    })
  })

  it('drops free text attached to a normal condition (POPIA)', async () => {
    const { token, practitioner } = await authed()
    await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: oneNewPatientWith({ ...entry, conditionOther: 'Mrs J Smith, 7 Oak Rd' }),
        token,
      }),
      dateParams(TODAY),
    )

    const stored = await prisma.conditionEntry.findFirstOrThrow({
      where: { patientEntry: { dailyLog: { practitionerId: practitioner.id } } },
    })
    expect(stored.conditionOther).toBeNull()
  })
})

describe('PUT /api/logs/:date — upsert (FR3)', () => {
  it('creates with 201 and returns the computed total', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, { method: 'PUT', body, token }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(201)

    const log = dailyLogSchema.parse(await readJson(response))
    expect(log.logDate).toBe(TODAY)
    expect(log.totalPatients).toBe(10)
    expect(log.patients).toHaveLength(10)
    expect(conditionsOf(log)).toHaveLength(1)
    expect(conditionsOf(log)[0].conditionCode).toBe('MH_ANXIETY')
  })

  it('stores each patient once, positioned within its own type', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: logBody([
          patientWith('NEW', [entry]),
          patientWith('FOLLOW_UP'),
          patientWith('NEW'),
        ]),
        token,
      }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(201)

    const log = dailyLogSchema.parse(await readJson(response))
    expect(log.newPatients).toBe(2)
    expect(log.followUpPatients).toBe(1)
    // Positions restart per type, and New comes back before Returning.
    expect(log.patients.map((p) => [p.patientType, p.position])).toEqual([
      ['NEW', 1],
      ['NEW', 2],
      ['FOLLOW_UP', 1],
    ])
  })

  it('keeps two conditions on one patient together (the point of the model)', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: logBody([
          patientWith('NEW', [
            entry,
            { ...entry, category: 'COMMUNICABLE', conditionCode: 'CD_TB' },
          ]),
          patientWith('NEW', [{ ...entry, conditionCode: 'MH_DEPRESSION' }]),
        ]),
        token,
      }),
      dateParams(TODAY),
    )

    const log = dailyLogSchema.parse(await readJson(response))
    expect(log.patients.map((p) => p.conditions.length)).toEqual([2, 1])
  })

  it('updates with 200 and keeps one row per practitioner per day', async () => {
    const { token, practitioner } = await authed()
    await putLog(
      apiRequest(`/api/logs/${TODAY}`, { method: 'PUT', body, token }),
      dateParams(TODAY),
    )

    const second = await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: logBody([
          patientWith('NEW', [{ ...entry, conditionCode: 'MH_DEPRESSION' }]),
          patientWith('FOLLOW_UP', [
            { ...entry, category: 'COMMUNICABLE', conditionCode: 'CD_TB' },
          ]),
        ]),
        token,
      }),
      dateParams(TODAY),
    )
    expect(second.status).toBe(200)

    const log = dailyLogSchema.parse(await readJson(second))
    expect(log.totalPatients).toBe(2)
    expect(
      conditionsOf(log)
        .map((c) => c.conditionCode)
        .sort(),
    ).toEqual(['CD_TB', 'MH_DEPRESSION'])

    expect(
      await prisma.dailyLog.count({ where: { practitionerId: practitioner.id } }),
    ).toBe(1)
    // The replaced patients and their entries are gone, not orphaned.
    expect(await prisma.patientEntry.count()).toBe(2)
    expect(await prisma.conditionEntry.count()).toBe(2)
  })

  it('accepts a day with counts but no conditions itemised', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: dayWith({ newPatients: 2 }),
        token,
      }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(201)
    const log = dailyLogSchema.parse(await readJson(response))
    // Two patients were seen; neither had anything itemised.
    expect(log.patients).toHaveLength(2)
    expect(conditionsOf(log)).toHaveLength(0)
  })

  it('keeps the free text on an "Other (specify)" row', async () => {
    const { token } = await authed()
    const response = await putLog(
      apiRequest(`/api/logs/${TODAY}`, {
        method: 'PUT',
        body: oneNewPatientWith({
          ...entry,
          conditionCode: otherConditionCode('MENTAL_HEALTH'),
          conditionOther: 'Exam stress',
        }),
        token,
      }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(201)
    const log = dailyLogSchema.parse(await readJson(response))
    expect(conditionsOf(log)[0].conditionOther).toBe('Exam stress')
  })
})

describe('GET /api/logs/:date and GET /api/logs', () => {
  it('404s when nothing has been logged for that date', async () => {
    const { token } = await authed()
    const response = await getLog(
      apiRequest(`/api/logs/${TODAY}`, { token }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(404)
    expect(apiErrorSchema.parse(await readJson(response)).error.code).toBe('NOT_FOUND')
  })

  it('returns the practitioner’s own log', async () => {
    const { token } = await authed()
    await putLog(
      apiRequest(`/api/logs/${TODAY}`, { method: 'PUT', body, token }),
      dateParams(TODAY),
    )

    const response = await getLog(
      apiRequest(`/api/logs/${TODAY}`, { token }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(200)
    expect(dailyLogSchema.parse(await readJson(response)).newPatients).toBe(4)
  })

  it('never returns another practitioner’s log', async () => {
    const first = await authed()
    const second = await authed()
    await putLog(
      apiRequest(`/api/logs/${TODAY}`, { method: 'PUT', body, token: first.token }),
      dateParams(TODAY),
    )

    const response = await getLog(
      apiRequest(`/api/logs/${TODAY}`, { token: second.token }),
      dateParams(TODAY),
    )
    expect(response.status).toBe(404)
  })

  it('reads a date outside the collection window without a 422', async () => {
    const { practitioner, token } = await authed()
    await prisma.dailyLog.create({
      data: { practitionerId: practitioner.id, logDate: '2026-09-30', newPatients: 1 },
    })

    const response = await getLog(
      apiRequest('/api/logs/2026-09-30', { token }),
      dateParams('2026-09-30'),
    )
    expect(response.status).toBe(200)
  })

  it('lists the caller’s logs newest first and nobody else’s', async () => {
    const first = await authed()
    const second = await authed()

    for (const date of [YESTERDAY, TODAY]) {
      await putLog(
        apiRequest(`/api/logs/${date}`, { method: 'PUT', body, token: first.token }),
        dateParams(date),
      )
    }
    await putLog(
      apiRequest(`/api/logs/${TODAY}`, { method: 'PUT', body, token: second.token }),
      dateParams(TODAY),
    )

    const response = await listLogs(apiRequest('/api/logs', { token: first.token }), undefined)
    expect(response.status).toBe(200)

    const parsed = dailyLogListResponseSchema.parse(await readJson(response))
    expect(parsed.logs.map((log) => log.logDate)).toEqual([TODAY, YESTERDAY])
  })

  it('401s without a credential', async () => {
    const response = await listLogs(apiRequest('/api/logs'), undefined)
    expect(response.status).toBe(401)
  })
})
