/**
 * Typeahead ranking (FR4, user story 2.4, rubric item 5 tier 3).
 *
 * These pin the two behaviours the 30-second target depends on: the list is
 * already correct before anyone types, and the acronyms a South African
 * homeopath will actually type — TB, HIV, UTI, flu — find the right row even
 * though none of them is the displayed label.
 *
 * OWNER: Stream 2.
 */
import { describe, expect, it } from 'vitest'

import {
  searchConditions,
  type SearchableCondition,
} from '../../src/lib/client/condition-search'
import { CONDITION_TAXONOMY, isOtherCondition } from '../../src/lib/contract/taxonomy'
import type { ConditionCategory } from '../../src/lib/contract/enums'

function categoryConditions(category: ConditionCategory): SearchableCondition[] {
  return CONDITION_TAXONOMY.filter((c) => c.category === category).map((c) => ({
    code: c.code,
    label: c.label,
    synonyms: c.synonyms ?? [],
    rank: c.rank ?? 100,
    isOther: isOtherCondition(c.code),
  }))
}

const communicable = categoryConditions('COMMUNICABLE')
const mentalHealth = categoryConditions('MENTAL_HEALTH')

describe('searchConditions', () => {
  it('returns every condition in rank order for an empty query', () => {
    const results = searchConditions(mentalHealth, '')
    expect(results).toHaveLength(mentalHealth.length)
    expect(results[0].code).toBe('MH_ANXIETY')
    expect(results[1].code).toBe('MH_DEPRESSION')
    // This is the "no typing needed" property the speed budget relies on.
    const ranks = results.filter((r) => !r.isOther).map((r) => r.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('always sinks "Other (specify)" to the bottom', () => {
    for (const category of ['MENTAL_HEALTH', 'COMMUNICABLE', 'OTHER'] as const) {
      const results = searchConditions(categoryConditions(category), '')
      expect(results[results.length - 1].isOther).toBe(true)
    }
  })

  it('finds TB and HIV inside Communicable, not as top-level categories', () => {
    // User story 2.4 makes this an explicit acceptance criterion.
    expect(searchConditions(communicable, 'TB')[0].code).toBe('CD_TB')
    expect(searchConditions(communicable, 'hiv')[0].code).toBe('CD_HIV')
    expect(searchConditions(communicable, 'tuberculosis')[0].code).toBe('CD_TB')
  })

  it('matches synonyms that never appear in the label', () => {
    expect(searchConditions(communicable, 'flu')[0].code).toBe('CD_ARI')
    expect(searchConditions(communicable, 'UTI')[0].code).toBe('CD_URINARY')
    expect(searchConditions(communicable, 'long covid')[0].code).toBe('CD_POSTVIRAL')
    expect(searchConditions(mentalHealth, 'insomnia')[0].code).toBe('MH_SLEEP')
    expect(
      searchConditions(categoryConditions('WOMENS_HEALTH_HORMONES'), 'hot flushes')[0]
        .code,
    ).toBe('WH_MENOPAUSE')
  })

  it('prefers a label prefix over a synonym match', () => {
    // "Migraine" is a label; "headache" is its synonym. Typing "mig" must not
    // be outranked by something that merely lists it as a synonym.
    const results = searchConditions(mentalHealth, 'mig')
    expect(results[0].code).toBe('MH_MIGRAINE')
  })

  it('breaks ties on rank, so the commoner condition wins', () => {
    // Both "Chronic pain / musculoskeletal" (rank 1) and "Chronic respiratory
    // disease" (rank 4) start with "chronic".
    const chronic = searchConditions(
      categoryConditions('NON_COMMUNICABLE_CHRONIC'),
      'chronic',
    ).filter((c) => !c.isOther)
    expect(chronic[0].code).toBe('NC_MUSCULOSKELETAL')
  })

  it('is case- and punctuation-insensitive', () => {
    expect(searchConditions(mentalHealth, 'ADHD')[0].code).toBe('MH_ADHD')
    expect(searchConditions(mentalHealth, 'adhd/')[0].code).toBe('MH_ADHD')
    expect(searchConditions(mentalHealth, '  Grief ')[0].code).toBe('MH_GRIEF')
  })

  it('offers only the free-text fallback when nothing matches', () => {
    const results = searchConditions(mentalHealth, 'zzzznotacondition')
    expect(results).toHaveLength(1)
    expect(results[0].isOther).toBe(true)
  })
})
