import { beforeAll, describe, expect, it } from 'vitest'

import { initTestDb } from './helpers/db'
import { apiRequest, readJson } from './helpers/request'

import { healthResponseSchema } from '@/lib/contract'
import { GET as health } from '@/app/api/health/route'

beforeAll(async () => {
  await initTestDb()
})

describe('GET /api/health (rubric item 11)', () => {
  it('answers 200 with no credential — the ping bot has none', async () => {
    const response = await health(apiRequest('/api/health'), undefined)
    expect(response.status).toBe(200)

    const body = healthResponseSchema.parse(await readJson(response))
    expect(body.status).toBe('ok')
    expect(body.database).toBe('ok')
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })

  it('is never cached — a stale 200 would hide an outage', async () => {
    const response = await health(apiRequest('/api/health'), undefined)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('says nothing about the deployment beyond a version string', async () => {
    const body = healthResponseSchema.parse(
      await readJson(await health(apiRequest('/api/health'), undefined)),
    )
    expect(Object.keys(body).sort()).toEqual([
      'database',
      'status',
      'timestamp',
      'uptimeSeconds',
      'version',
    ])
  })
})
