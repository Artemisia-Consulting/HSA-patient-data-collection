import './helpers/env'

import { describe, expect, it } from 'vitest'

import { escapeCsvValue, toCsv } from '@/lib/server/csv'
import { fieldErrorsFromZod } from '@/lib/server/errors'
import { clientIp } from '@/lib/server/http'
import { consumeRateLimit, resetRateLimits } from '@/lib/server/rateLimit'
import { hashSessionToken, generateSessionToken, safeCompare } from '@/lib/server/auth'
import { dailyLogRequestSchema } from '@/lib/contract'

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

describe('Zod issue flattening', () => {
  it('dots nested paths so the frontend can address the input', () => {
    const result = dailyLogRequestSchema.safeParse({
      newPatients: -1,
      followUpPatients: 0,
      conditions: [
        {
          category: 'MENTAL_HEALTH',
          conditionCode: 'MENTAL_HEALTH__OTHER',
          diagnosisBasis: 'CLINICAL_DIAGNOSIS',
          alsoSeeingGp: 'YES',
          referredByGp: 'NO',
        },
      ],
    })
    expect(result.success).toBe(false)

    const fieldErrors = fieldErrorsFromZod(result.error!)
    expect(fieldErrors.newPatients).toBeDefined()
    expect(fieldErrors['conditions.0.conditionOther']).toBeDefined()
  })
})
