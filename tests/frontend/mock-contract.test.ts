/**
 * The integration insurance policy.
 *
 * Stream 2 builds against a mock while Agent 1 builds the real routes. That is
 * only safe if the mock is provably the same shape as the contract — so every
 * response the frontend can receive is parsed here with the *contract's own*
 * Zod schema, not with a hand-written expectation. If Agent 1 implements the
 * same schemas, swapping `USE_MOCK_API` to false is the only change needed.
 *
 * It also pins the status codes the UI branches on: 201 vs 200 on the log
 * upsert, 409 on a duplicate email, 404 on an unlogged date, 401 with no
 * credentials. Those are what the screens key off, so a drift in any of them
 * is a behaviour change, not a cosmetic one.
 *
 * OWNER: Stream 2.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { installBrowserEnv, resetBrowserEnv } from './helpers/browser-env'

// The mock is opt-in since integration (see transport.ts). This suite tests
// the mock itself, so it switches it on before any client module is imported.
process.env.NEXT_PUBLIC_USE_MOCK_API = 'true'

installBrowserEnv()

const { setMockLatency, setMockOffline } = await import(
  '../../src/lib/client/mock/server'
)
setMockLatency(0)

const api = await import('../../src/lib/client/api')
const { ApiClientError } = await import('../../src/lib/client/http')
const { clearSession } = await import('../../src/lib/client/session')
const {
  apiErrorSchema,
  authSessionResponseSchema,
  dailyLogSchema,
  meResponseSchema,
  taxonomyResponseSchema,
} = await import('../../src/lib/contract/api')
const { CONDITION_CATEGORIES } = await import('../../src/lib/contract/enums')
const { todayInSast } = await import('../../src/lib/dates')

const SIGNUP = {
  email: 'thandi@example.co.za',
  fullName: 'Thandi Mokoena',
  practiceName: 'Rosebank Homoeopathy',
  province: 'Gauteng',
  consent: true as const,
}

beforeEach(() => {
  setMockOffline(false)
  resetBrowserEnv()
  clearSession()
})

describe('POST /api/auth/signup', () => {
  it('returns a contract-shaped session on 201', async () => {
    const result = await api.signup(SIGNUP)
    expect(() => authSessionResponseSchema.parse(result)).not.toThrow()
    expect(result.practitioner.email).toBe(SIGNUP.email)
    expect(result.practitioner.onboardedAt).toBeNull()
    expect(result.practitioner.role).toBe('PRACTITIONER')
    // The consent tick IS the consent record (user story 1.6) — so a signup
    // that succeeded must carry a timestamp for it.
    expect(Date.parse(result.practitioner.consentAt)).not.toBeNaN()
    expect(result.reminderLink).toContain(result.practitioner.reminderLinkId)
  })

  it('rejects a duplicate email with 409 EMAIL_ALREADY_REGISTERED', async () => {
    await api.signup(SIGNUP)
    clearSession()
    await expect(api.signup(SIGNUP)).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
    })
  })

  it('rejects an unticked consent box with a field error', async () => {
    await expect(
      api.signup({ ...SIGNUP, email: 'x@example.co.za', consent: false as never }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' })
  })

  it('shapes every error as the contract error envelope', async () => {
    await api.signup(SIGNUP)
    clearSession()
    try {
      await api.signup(SIGNUP)
      throw new Error('expected a 409')
    } catch (error) {
      const asApiError = error as InstanceType<typeof ApiClientError>
      expect(() =>
        apiErrorSchema.parse({
          error: {
            code: asApiError.code,
            message: asApiError.message,
            fieldErrors: asApiError.fieldErrors,
          },
        }),
      ).not.toThrow()
    }
  })
})

describe('GET /api/auth/me', () => {
  it('401s with no session and no reminder link', async () => {
    await expect(api.me()).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    })
  })

  it('returns the contract shape, with the server deciding "today"', async () => {
    await api.signup(SIGNUP)
    const result = await api.me()
    expect(() => meResponseSchema.parse(result)).not.toThrow()
    expect(result.today).toBe(todayInSast())
    expect(result.hasLoggedToday).toBe(false)
  })
})

describe('POST /api/auth/resume — the reminder-link path', () => {
  it('identifies a device with no session at all (user story 2.1)', async () => {
    const created = await api.signup(SIGNUP)
    const { reminderLinkId } = created.practitioner

    // Simulate a brand-new phone: nothing stored locally.
    clearSession()
    await expect(api.me()).rejects.toMatchObject({ status: 401 })

    const resumed = await api.resume(reminderLinkId)
    expect(() => authSessionResponseSchema.parse(resumed)).not.toThrow()
    expect(resumed.practitioner.id).toBe(created.practitioner.id)
    // A fresh session token, so the next visit needs no link at all.
    expect(resumed.sessionToken).not.toBe(created.sessionToken)
    await expect(api.me()).resolves.toBeTruthy()
  })

  it('401s on an unknown link id', async () => {
    await expect(api.resume('lnk_nothing_here')).rejects.toMatchObject({ status: 401 })
  })
})

describe('POST /api/auth/onboarded', () => {
  it('sets onboardedAt so the walkthrough is shown once (FR2)', async () => {
    await api.signup(SIGNUP)
    const before = await api.me()
    expect(before.practitioner.onboardedAt).toBeNull()

    const after = await api.markOnboarded()
    expect(() => meResponseSchema.parse(after)).not.toThrow()
    expect(after.practitioner.onboardedAt).not.toBeNull()
    expect((await api.me()).practitioner.onboardedAt).not.toBeNull()
  })
})

describe('GET /api/taxonomy', () => {
  it('returns 5 categories in contract shape, each with an "Other" row', async () => {
    const taxonomy = await api.getTaxonomy()
    expect(() => taxonomyResponseSchema.parse(taxonomy)).not.toThrow()
    expect(taxonomy.categories.map((c) => c.code)).toEqual([...CONDITION_CATEGORIES])
    for (const category of taxonomy.categories) {
      expect(category.conditions.filter((c) => c.isOther)).toHaveLength(1)
      expect(category.conditions[category.conditions.length - 1].isOther).toBe(true)
    }
    expect(taxonomy.categories.flatMap((c) => c.conditions)).toHaveLength(45)
  })

  it('never exposes an empty label, because the UI must render labels', async () => {
    const taxonomy = await api.getTaxonomy()
    for (const category of taxonomy.categories) {
      expect(category.label.length).toBeGreaterThan(0)
      for (const condition of category.conditions) {
        expect(condition.label.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('the daily log routes', () => {
  const today = todayInSast()

  it('404s before anything is logged for a date', async () => {
    await api.signup(SIGNUP)
    await expect(api.getLog(today)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    })
  })

  it('upserts: one row per practitioner per day', async () => {
    await api.signup(SIGNUP)

    const first = await api.putLog(today, {
      newPatients: 4,
      followUpPatients: 6,
      conditions: [
        {
          category: 'MENTAL_HEALTH',
          conditionCode: 'MH_ANXIETY',
          diagnosisBasis: 'CLINICAL_DIAGNOSIS',
          alsoSeeingGp: 'UNSURE',
          referredByGp: 'NOT_APPLICABLE',
        },
      ],
    })
    expect(() => dailyLogSchema.parse(first)).not.toThrow()
    expect(first.totalPatients).toBe(10)
    expect((await api.me()).hasLoggedToday).toBe(true)

    const second = await api.putLog(today, {
      newPatients: 5,
      followUpPatients: 6,
      conditions: [],
    })
    expect(second.id).toBe(first.id)
    expect(second.newPatients).toBe(5)
    expect(second.conditions).toHaveLength(0)
    expect((await api.listLogs())).toHaveLength(1)
  })

  it('stores the free text only for an "Other" code', async () => {
    await api.signup(SIGNUP)
    const log = await api.putLog(today, {
      newPatients: 1,
      followUpPatients: 0,
      conditions: [
        {
          category: 'OTHER',
          conditionCode: 'OTHER__OTHER',
          conditionOther: 'post-surgical recovery support',
          diagnosisBasis: 'PRESENTING_COMPLAINT_ONLY',
          alsoSeeingGp: 'YES',
          referredByGp: 'YES',
        },
        {
          category: 'MENTAL_HEALTH',
          conditionCode: 'MH_SLEEP',
          diagnosisBasis: 'CLINICAL_DIAGNOSIS',
          alsoSeeingGp: 'NO',
          referredByGp: 'NO',
        },
      ],
    })
    expect(log.conditions[0].conditionOther).toBe('post-surgical recovery support')
    expect(log.conditions[1].conditionOther).toBeNull()
  })

  it('rejects an "Other" code with no free text', async () => {
    await api.signup(SIGNUP)
    await expect(
      api.putLog(today, {
        newPatients: 0,
        followUpPatients: 0,
        conditions: [
          {
            category: 'COMMUNICABLE',
            conditionCode: 'COMMUNICABLE__OTHER',
            conditionOther: '',
            diagnosisBasis: 'CLINICAL_DIAGNOSIS',
            alsoSeeingGp: 'UNSURE',
            referredByGp: 'NOT_APPLICABLE',
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' })
  })

  it('rejects counts outside the contract range', async () => {
    await api.signup(SIGNUP)
    await expect(
      api.putLog(today, { newPatients: 201, followUpPatients: 0, conditions: [] }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      api.putLog(today, { newPatients: -1, followUpPatients: 0, conditions: [] }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('401s on every log route without credentials', async () => {
    await expect(api.getLog(today)).rejects.toMatchObject({ status: 401 })
    await expect(api.listLogs()).rejects.toMatchObject({ status: 401 })
    await expect(
      api.putLog(today, { newPatients: 0, followUpPatients: 0, conditions: [] }),
    ).rejects.toMatchObject({ status: 401 })
  })
})

describe('POPIA', () => {
  it('has no patient-identifying field anywhere in a stored log', async () => {
    await api.signup(SIGNUP)
    const log = await api.putLog(todayInSast(), {
      newPatients: 2,
      followUpPatients: 1,
      conditions: [
        {
          category: 'COMMUNICABLE',
          conditionCode: 'CD_TB',
          diagnosisBasis: 'CLINICAL_DIAGNOSIS',
          alsoSeeingGp: 'YES',
          referredByGp: 'YES',
        },
      ],
    })

    const serialised = JSON.stringify(log).toLowerCase()
    for (const forbidden of [
      'patientname',
      'patientref',
      'patientreference',
      'idnumber',
      'identitynumber',
      'dateofbirth',
      'dob',
      'notes',
      'surname',
      'initials',
    ]) {
      expect(serialised).not.toContain(forbidden)
    }

    // A condition row says "this was treated today" and nothing else.
    expect(Object.keys(log.conditions[0]).sort()).toEqual([
      'alsoSeeingGp',
      'category',
      'conditionCode',
      'conditionOther',
      'diagnosisBasis',
      'id',
      'referredByGp',
    ])
  })
})
