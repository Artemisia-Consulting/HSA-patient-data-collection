import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { initTestDb } from './helpers/db'
import { apiRequest, readJson } from './helpers/request'

import {
  CONDITION_CATEGORIES,
  CONDITION_TAXONOMY,
  taxonomyResponseSchema,
} from '@/lib/contract'
import { prisma } from '@/lib/db'
import { GET as taxonomy } from '@/app/api/taxonomy/route'

beforeAll(async () => {
  await initTestDb()
})

afterEach(async () => {
  // Undo anything a test did to the list.
  await prisma.condition.deleteMany({ where: { code: 'MH_NEW_MIDMONTH' } })
  await prisma.condition.updateMany({ data: { isActive: true } })
})

async function fetchTaxonomy(headers?: Record<string, string>) {
  return taxonomy(apiRequest('/api/taxonomy', { headers }), undefined)
}

describe('GET /api/taxonomy (FR4)', () => {
  it('needs no session — the signup screen preloads it', async () => {
    const response = await fetchTaxonomy()
    expect(response.status).toBe(200)
  })

  it('returns all five categories with their conditions', async () => {
    const body = taxonomyResponseSchema.parse(await readJson(await fetchTaxonomy()))

    expect(body.categories.map((c) => c.code)).toEqual([...CONDITION_CATEGORIES])
    const total = body.categories.reduce((sum, c) => sum + c.conditions.length, 0)
    expect(total).toBe(CONDITION_TAXONOMY.length)
  })

  it('nests HIV and TB under Communicable, not at the top level', async () => {
    const body = taxonomyResponseSchema.parse(await readJson(await fetchTaxonomy()))
    const communicable = body.categories.find((c) => c.code === 'COMMUNICABLE')
    const codes = communicable?.conditions.map((c) => c.code) ?? []
    expect(codes).toContain('CD_TB')
    expect(codes).toContain('CD_HIV')
  })

  it('ranks common conditions first for the typeahead (rubric item 5, tier 3)', async () => {
    const body = taxonomyResponseSchema.parse(await readJson(await fetchTaxonomy()))
    const mentalHealth = body.categories.find((c) => c.code === 'MENTAL_HEALTH')
    const ranks = mentalHealth?.conditions.map((c) => c.rank) ?? []
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(mentalHealth?.conditions[0].code).toBe('MH_ANXIETY')
  })

  it('flags the "Other (specify)" row in every category', async () => {
    const body = taxonomyResponseSchema.parse(await readJson(await fetchTaxonomy()))
    for (const category of body.categories) {
      const others = category.conditions.filter((c) => c.isOther)
      expect(others).toHaveLength(1)
      expect(others[0].code).toBe(`${category.code}__OTHER`)
    }
  })

  it('splits stored synonyms for the typeahead', async () => {
    const body = taxonomyResponseSchema.parse(await readJson(await fetchTaxonomy()))
    const tb = body.categories
      .flatMap((c) => c.conditions)
      .find((c) => c.code === 'CD_TB')
    expect(tb?.synonyms).toContain('tuberculosis')
  })

  it('serves an ETag and answers 304 when it matches', async () => {
    const first = await fetchTaxonomy()
    const etag = first.headers.get('etag')
    expect(etag).toBeTruthy()

    const second = await fetchTaxonomy({ 'if-none-match': etag as string })
    expect(second.status).toBe(304)
    expect(await second.text()).toBe('')
  })

  it('is cacheable', async () => {
    const response = await fetchTaxonomy()
    expect(response.headers.get('cache-control')).toContain('max-age')
  })

  it('changes version when the list is extended mid-October — no redeploy', async () => {
    const before = taxonomyResponseSchema.parse(await readJson(await fetchTaxonomy()))

    await prisma.condition.create({
      data: {
        code: 'MH_NEW_MIDMONTH',
        category: 'MENTAL_HEALTH',
        label: 'Newly added condition',
        synonyms: 'added|mid-october',
        rank: 10,
      },
    })

    const after = taxonomyResponseSchema.parse(await readJson(await fetchTaxonomy()))
    expect(after.version).not.toBe(before.version)

    const codes = after.categories
      .find((c) => c.code === 'MENTAL_HEALTH')
      ?.conditions.map((c) => c.code)
    expect(codes).toContain('MH_NEW_MIDMONTH')
  })

  it('hides a retired condition', async () => {
    await prisma.condition.update({
      where: { code: 'MH_EPILEPSY' },
      data: { isActive: false },
    })

    const body = taxonomyResponseSchema.parse(await readJson(await fetchTaxonomy()))
    const codes = body.categories.flatMap((c) => c.conditions).map((c) => c.code)
    expect(codes).not.toContain('MH_EPILEPSY')
  })
})
