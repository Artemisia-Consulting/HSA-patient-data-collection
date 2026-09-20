/**
 * Typeahead ranking for the condition sub-list (FR4, rubric item 5 tier 3).
 *
 * Two rules do the real work:
 *
 *  1. With an empty query the list is already useful — conditions come back in
 *     `rank` order, so a homeopath logging anxiety or a chest infection taps
 *     once without typing anything. Typing is the fallback, not the path.
 *  2. Synonyms are searched but never shown. "TB", "flu", "hot flushes" and
 *     "long covid" all find the right row; the row still reads in the
 *     taxonomy's own words, so the stored code is unambiguous.
 *
 * "Other (specify)" is pinned last whatever the query, so it never displaces a
 * real condition from the first screenful — but it is always reachable.
 *
 * Pure and dependency-free so `tests/frontend/condition-search.test.ts` can
 * pin the ordering.
 *
 * OWNER: Stream 2.
 */

export interface SearchableCondition {
  code: string
  label: string
  synonyms: string[]
  rank: number
  isOther: boolean
}

/** Lower is better. */
const MATCH_EXACT_LABEL = 0
const MATCH_LABEL_PREFIX = 1
const MATCH_LABEL_WORD_PREFIX = 2
const MATCH_SYNONYM_PREFIX = 3
const MATCH_LABEL_SUBSTRING = 4
const MATCH_SYNONYM_SUBSTRING = 5
const NO_MATCH = 99

export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function wordPrefixMatch(haystack: string, needle: string): boolean {
  return haystack.split(' ').some((word) => word.startsWith(needle))
}

export function scoreCondition(condition: SearchableCondition, query: string): number {
  const q = normalise(query)
  if (!q) return MATCH_EXACT_LABEL

  const label = normalise(condition.label)
  if (label === q) return MATCH_EXACT_LABEL
  if (label.startsWith(q)) return MATCH_LABEL_PREFIX
  if (wordPrefixMatch(label, q)) return MATCH_LABEL_WORD_PREFIX

  const synonyms = condition.synonyms.map(normalise)
  if (synonyms.some((s) => s.startsWith(q) || wordPrefixMatch(s, q)))
    return MATCH_SYNONYM_PREFIX

  if (label.includes(q)) return MATCH_LABEL_SUBSTRING
  if (synonyms.some((s) => s.includes(q))) return MATCH_SYNONYM_SUBSTRING

  return NO_MATCH
}

/**
 * Ranked matches for `query` within one category's conditions.
 * An empty query returns every condition in `rank` order.
 */
export function searchConditions<T extends SearchableCondition>(
  conditions: readonly T[],
  query: string,
): T[] {
  const q = normalise(query)

  const scored = conditions
    .map((condition) => ({ condition, score: scoreCondition(condition, query) }))
    .filter(({ score, condition }) => score !== NO_MATCH || condition.isOther)

  scored.sort((a, b) => {
    // "Other (specify)" always sinks to the bottom.
    if (a.condition.isOther !== b.condition.isOther) return a.condition.isOther ? 1 : -1
    if (a.score !== b.score) return a.score - b.score
    if (a.condition.rank !== b.condition.rank) return a.condition.rank - b.condition.rank
    return a.condition.label.localeCompare(b.condition.label)
  })

  // With a query that matched nothing real, still offer the free-text row.
  const hasRealMatch = scored.some(
    ({ condition, score }) => !condition.isOther && score !== NO_MATCH,
  )
  if (q && !hasRealMatch) {
    return scored.filter(({ condition }) => condition.isOther).map((s) => s.condition)
  }

  return scored.map((s) => s.condition)
}
