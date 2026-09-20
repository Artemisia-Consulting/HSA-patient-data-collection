/**
 * Offline save for the daily entry (rubric item 4, tier 3).
 *
 * The scenario, concretely: a homeopath in a rural practice with one bar of
 * signal taps Submit. These tests assert the day's work survives that, and —
 * just as important — that a *real* server rejection is never disguised as
 * "saved offline", because that would lose the entry silently.
 *
 * OWNER: Stream 2.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { installBrowserEnv, resetBrowserEnv, storage } from './helpers/browser-env'

installBrowserEnv()

const { setMockLatency, setMockOffline } = await import(
  '../../src/lib/client/mock/server'
)
setMockLatency(0)

const api = await import('../../src/lib/client/api')
const { ApiNetworkError } = await import('../../src/lib/client/http')
const { clearSession } = await import('../../src/lib/client/session')
const { flushOutbox, pendingFor, queueLog, readOutbox, removeFromOutbox } =
  await import('../../src/lib/client/outbox')
const { clearDraft, loadDraft, saveDraft } = await import('../../src/lib/client/draft')
const { dailyLogRequestSchema } = await import('../../src/lib/contract/api')

const MONDAY = '2026-10-05'
const TUESDAY = '2026-10-06'

const body = (newPatients: number) => ({
  newPatients,
  followUpPatients: 2,
  conditions: [
    {
      category: 'MENTAL_HEALTH' as const,
      conditionCode: 'MH_ANXIETY',
      diagnosisBasis: 'CLINICAL_DIAGNOSIS' as const,
      alsoSeeingGp: 'UNSURE' as const,
      referredByGp: 'NOT_APPLICABLE' as const,
    },
  ],
})

async function signIn() {
  await api.signup({
    email: `p${Math.random().toString(36).slice(2, 8)}@example.co.za`,
    fullName: 'Test Practitioner',
    consent: true,
  })
}

beforeEach(() => {
  setMockOffline(false)
  resetBrowserEnv()
  clearSession()
})

describe('the queue', () => {
  it('holds one entry per date, replacing rather than stacking', () => {
    queueLog(MONDAY, body(1))
    queueLog(MONDAY, body(9))
    queueLog(TUESDAY, body(3))

    expect(readOutbox()).toHaveLength(2)
    // The later submit wins: the practitioner corrected the day, they did not
    // log it twice. The API is an upsert, so a replay of this is idempotent.
    expect(pendingFor(MONDAY)?.body.newPatients).toBe(9)
    expect(pendingFor(TUESDAY)?.body.newPatients).toBe(3)
  })

  it('only ever queues contract-valid bodies', () => {
    queueLog(MONDAY, body(4))
    for (const item of readOutbox()) {
      expect(dailyLogRequestSchema.safeParse(item.body).success).toBe(true)
    }
  })

  it('removes a date once it is dealt with', () => {
    queueLog(MONDAY, body(1))
    removeFromOutbox(MONDAY)
    expect(readOutbox()).toHaveLength(0)
    expect(pendingFor(MONDAY)).toBeUndefined()
  })

  it('survives a corrupt storage value rather than throwing', () => {
    storage.setItem('hsa.outbox.dailyLogs.v1', '{not json')
    expect(readOutbox()).toEqual([])
    // And a well-formed value of the wrong shape is filtered, not trusted.
    storage.setItem('hsa.outbox.dailyLogs.v1', '[{"nonsense":true}]')
    expect(readOutbox()).toEqual([])
  })
})

describe('a submit with no connection', () => {
  it('raises ApiNetworkError, which is what the form queues on', async () => {
    await signIn()
    setMockOffline(true)
    await expect(api.putLog(MONDAY, body(5))).rejects.toBeInstanceOf(ApiNetworkError)
  })

  it('keeps the entry queued while offline and sends it when back online', async () => {
    await signIn()
    setMockOffline(true)

    try {
      await api.putLog(MONDAY, body(5))
    } catch {
      queueLog(MONDAY, body(5))
    }
    expect(readOutbox()).toHaveLength(1)

    // Still offline: a flush must not lose the entry.
    const whileOffline = await flushOutbox()
    expect(whileOffline.sent).toBe(0)
    expect(whileOffline.remaining).toBe(1)
    expect(whileOffline.rejected).toEqual([])

    setMockOffline(false)
    const whenOnline = await flushOutbox()
    expect(whenOnline.sent).toBe(1)
    expect(whenOnline.remaining).toBe(0)

    const stored = await api.getLog(MONDAY)
    expect(stored.newPatients).toBe(5)
    expect(readOutbox()).toHaveLength(0)
  })

  it('flushes several days in one go', async () => {
    await signIn()
    queueLog(MONDAY, body(1))
    queueLog(TUESDAY, body(2))

    const result = await flushOutbox()
    expect(result.sent).toBe(2)
    expect(result.remaining).toBe(0)
    expect(await api.listLogs()).toHaveLength(2)
  })

  it('is a no-op on an empty queue, so it is safe to call on every load', async () => {
    const result = await flushOutbox()
    expect(result).toEqual({ sent: 0, remaining: 0, rejected: [] })
  })
})

describe('a replay the server refuses', () => {
  it('reports it as rejected and keeps it, rather than dropping it silently', async () => {
    await signIn()
    // A body that passed client validation at queue time but is refused now —
    // e.g. the queue outlived a taxonomy change.
    queueLog(MONDAY, {
      newPatients: 1,
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
    })

    const result = await flushOutbox()
    expect(result.sent).toBe(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].lastError).toBeTruthy()
    // Still in the queue with its error attached: the UI can surface it and
    // the practitioner can fix the day. Nothing is thrown away.
    expect(readOutbox()).toHaveLength(1)
    expect(pendingFor(MONDAY)?.lastError).toBeTruthy()
  })

  it('does not queue a 401 as if it were a connection problem', async () => {
    // Signed out entirely. This is a real answer from the server, and the form
    // must send the practitioner back to their logging link, not pretend the
    // entry is safely on the phone.
    await expect(api.putLog(MONDAY, body(1))).rejects.toMatchObject({ status: 401 })
    await expect(api.putLog(MONDAY, body(1))).rejects.not.toBeInstanceOf(ApiNetworkError)
  })
})

describe('the in-progress draft', () => {
  it('survives the app being killed mid-entry', () => {
    saveDraft(MONDAY, body(3))
    expect(loadDraft(MONDAY)?.body.newPatients).toBe(3)
    expect(loadDraft(TUESDAY)).toBeNull()
  })

  it('is dropped, not rehydrated, if it no longer validates', () => {
    // Simulate a draft written by an older build.
    storage.setItem(
      'hsa.draft.dailyLog.v1.' + MONDAY,
      JSON.stringify({ savedAt: new Date().toISOString(), body: { newPatients: 999 } }),
    )
    expect(loadDraft(MONDAY)).toBeNull()
    // And it cleans up after itself, so it cannot fail repeatedly.
    expect(storage.getItem('hsa.draft.dailyLog.v1.' + MONDAY)).toBeNull()
  })

  it('is cleared once the day is submitted', () => {
    saveDraft(MONDAY, body(3))
    clearDraft(MONDAY)
    expect(loadDraft(MONDAY)).toBeNull()
  })
})

describe('what is written to the phone', () => {
  it('contains no patient-identifying data anywhere in storage (POPIA)', async () => {
    await signIn()
    queueLog(MONDAY, body(4))
    saveDraft(TUESDAY, body(2))

    const everything = Array.from({ length: storage.length }, (_, i) => {
      const key = storage.key(i) as string
      return `${key}=${storage.getItem(key)}`
    }).join('\n')

    expect(everything).not.toMatch(/patient(Name|Ref|Reference)|idNumber|surname|dob/i)
    // Counts, dates, taxonomy codes and enum values only.
    expect(everything).toContain('MH_ANXIETY')
  })
})
