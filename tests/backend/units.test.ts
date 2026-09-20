import './helpers/env'

import { describe, expect, it } from 'vitest'

import { escapeCsvValue, toCsv } from '@/lib/server/csv'
import { fieldErrorsFromZod } from '@/lib/server/errors'
import { clientIp } from '@/lib/server/http'
import { consumeRateLimit, resetRateLimits } from '@/lib/server/rateLimit'
import { hashSessionToken, generateSessionToken, safeCompare } from '@/lib/server/auth'
import { dailyLogRequestSchema } from '@/lib/contract'
import {
  COLLECTION_END_DATE,
  COLLECTION_START_DATE,
  EARLY_ENTRY_FROM_DATE,
  addDaysToLogDate,
  isWithinCollectionWindow,
  isWritableLogDate,
} from '@/lib/dates'

describe('CSV serialisation', () => {
  it('quotes values containing a comma, quote or newline', () => {
    expect(escapeCsvValue('plain')).toBe('plain')
    expect(escapeCsvValue('a,b')).toBe('"a,b"')
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"')
  })

  it('renders null and undefined as empty cells', () => {
    expect(escapeCsvValue(null)).toBe('')
    expect(escapeCsvValue(undefined)).toBe('')
    expect(escapeCsvValue(0)).toBe('0')
    expect(escapeCsvValue(false)).toBe('false')
  })

  it('neutralises every formula prefix Excel acts on', () => {
    for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
      expect(escapeCsvValue(`${prefix}SUM(A1)`)).toContain("'")
    }
  })

  it('does not mangle a value that merely contains an equals sign', () => {
    expect(escapeCsvValue('x=1')).toBe('x=1')
  })

  it('writes CRLF rows and a BOM by default', () => {
    const csv = toCsv(['a', 'b'], [[1, 2]])
    expect(csv).toBe('﻿a,b\r\n1,2\r\n')
    expect(toCsv(['a'], [[1]], { bom: false })).toBe('a\r\n1\r\n')
  })
})

describe('rate limiter', () => {
  it('allows up to the limit then refuses', () => {
    resetRateLimits()
    const key = 'test-key'
    for (let i = 0; i < 3; i += 1) {
      expect(consumeRateLimit(key, 3, 1000).allowed).toBe(true)
    }
    const blocked = consumeRateLimit(key, 3, 1000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('opens a new window once the old one expires', () => {
    resetRateLimits()
    const start = 1_000_000
    consumeRateLimit('window-key', 1, 1000, start)
    expect(consumeRateLimit('window-key', 1, 1000, start + 500).allowed).toBe(false)
    expect(consumeRateLimit('window-key', 1, 1000, start + 1500).allowed).toBe(true)
  })

  it('counts each caller separately', () => {
    resetRateLimits()
    consumeRateLimit('a', 1, 1000)
    expect(consumeRateLimit('b', 1, 1000).allowed).toBe(true)
  })
})

describe('session tokens', () => {
  it('are unguessable and stored only as a SHA-256 hash', () => {
    const token = generateSessionToken()
    expect(token.length).toBeGreaterThanOrEqual(43)
    expect(generateSessionToken()).not.toBe(token)

    const hash = hashSessionToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(hashSessionToken(token)).toBe(hash)
  })

  it('compares shared secrets without leaking length-independent timing', () => {
    expect(safeCompare('secret', 'secret')).toBe(true)
    expect(safeCompare('secret', 'secrez')).toBe(false)
    expect(safeCompare('secret', 'longer-secret')).toBe(false)
  })
})

describe('client IP extraction', () => {
  it('takes the first entry of x-forwarded-for', () => {
    const request = new Request('http://localhost/api/health', {
      headers: { 'x-forwarded-for': '41.1.2.3, 10.0.0.1' },
    })
    expect(clientIp(request)).toBe('41.1.2.3')
  })

  it('falls back to a constant when the proxy sends nothing', () => {
    expect(clientIp(new Request('http://localhost/api/health'))).toBe('unknown')
  })
})

/**
 * Two questions about a date, with deliberately different answers: whether the
 * day counts towards the study, and whether a log may be saved for it at all.
 * Conflating them is what these tests exist to catch — reminders and the
 * research dataset key off the first, the write path off the second.
 */
describe('collection window vs. writable date', () => {
  const dayBeforeStart = addDaysToLogDate(COLLECTION_START_DATE, -1)
  const dayAfterEnd = addDaysToLogDate(COLLECTION_END_DATE, 1)
  const dayBeforeFloor = addDaysToLogDate(EARLY_ENTRY_FROM_DATE, -1)

  it('counts only the collection window towards the study', () => {
    expect(isWithinCollectionWindow(COLLECTION_START_DATE)).toBe(true)
    expect(isWithinCollectionWindow(COLLECTION_END_DATE)).toBe(true)
    expect(isWithinCollectionWindow(dayBeforeStart)).toBe(false)
    expect(isWithinCollectionWindow(dayAfterEnd)).toBe(false)
  })

  it('lets a day before the study opens be written anyway', () => {
    expect(isWritableLogDate(dayBeforeStart)).toBe(true)
    expect(isWritableLogDate(EARLY_ENTRY_FROM_DATE)).toBe(true)
  })

  it('still refuses a date far enough back to be a typo', () => {
    expect(isWritableLogDate(dayBeforeFloor)).toBe(false)
    expect(isWritableLogDate('2025-10-01')).toBe(false)
  })

  // Nothing widens the far end: a day after the study has closed is not a day
  // anyone needs to record, and the floor only ever moved on the early side.
  it('does not widen the window after it closes', () => {
    expect(isWritableLogDate(COLLECTION_END_DATE)).toBe(true)
    expect(isWritableLogDate(dayAfterEnd)).toBe(false)
  })

  it('opens the floor a full quarter before the study', () => {
    expect(EARLY_ENTRY_FROM_DATE).toBe('2026-07-03')
    expect(EARLY_ENTRY_FROM_DATE < COLLECTION_START_DATE).toBe(true)
  })
})

describe('Zod issue flattening', () => {
  it('dots nested paths so the frontend can address the input', () => {
    const result = dailyLogRequestSchema.safeParse({
      newPatients: -1,
      followUpPatients: 0,
      patients: [
        {
          patientType: 'NEW',
          conditions: [
            {
              category: 'MENTAL_HEALTH',
              conditionCode: 'MENTAL_HEALTH__OTHER',
              diagnosisBasis: 'CLINICAL_DIAGNOSIS',
              alsoSeeingGp: 'YES',
              referredByGp: 'NO',
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(false)

    const fieldErrors = fieldErrorsFromZod(result.error!)
    expect(fieldErrors.newPatients).toBeDefined()
    // Two indices deep: the card the frontend has to mark is a condition on a
    // particular patient, not a condition on the day.
    expect(fieldErrors['patients.0.conditions.0.conditionOther']).toBeDefined()
  })
})
