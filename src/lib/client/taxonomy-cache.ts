/**
 * Stale-while-revalidate cache for GET /api/taxonomy.
 *
 * The taxonomy is ~45 rows that change at most a handful of times during
 * October, and the log form is unusable without it. On a poor connection we
 * would rather render instantly from last night's copy and quietly refresh
 * than show a spinner over the one screen that has a 30-second budget.
 *
 * The contract's `version` field is what makes this safe: if it changed, the
 * fresh copy replaces the cached one and the UI re-renders. If the network is
 * down entirely, the cached copy is simply used, which is most of what makes
 * the form work offline.
 *
 * OWNER: Stream 2.
 */
import {
  type TaxonomyResponse,
  taxonomyResponseSchema,
} from '../contract/api'
import { getTaxonomy } from './api'
import { readJson, writeJson } from './storage'

const KEY = 'hsa.cache.taxonomy.v1'

interface CachedTaxonomy {
  fetchedAt: string
  payload: unknown
}

export function readCachedTaxonomy(): TaxonomyResponse | null {
  const cached = readJson<CachedTaxonomy | null>(KEY, null)
  if (!cached) return null
  const parsed = taxonomyResponseSchema.safeParse(cached.payload)
  // A cache written by an older build that no longer matches the contract is
  // dropped rather than rendered.
  return parsed.success ? parsed.data : null
}

export function writeCachedTaxonomy(taxonomy: TaxonomyResponse): void {
  writeJson(KEY, { fetchedAt: new Date().toISOString(), payload: taxonomy })
}

export interface TaxonomyLoad {
  taxonomy: TaxonomyResponse
  /** True when this came from the cache because the network failed. */
  fromCache: boolean
}

/**
 * Cached copy first (if any), then a network refresh. `onFresh` fires only if
 * the network copy differs by `version`, so the common case is zero re-renders.
 */
export async function loadTaxonomy(
  onFresh?: (taxonomy: TaxonomyResponse) => void,
): Promise<TaxonomyLoad> {
  const cached = readCachedTaxonomy()

  if (cached) {
    void getTaxonomy()
      .then((fresh) => {
        writeCachedTaxonomy(fresh)
        if (fresh.version !== cached.version) onFresh?.(fresh)
      })
      .catch(() => {
        /* offline: the cached copy stands */
      })
    return { taxonomy: cached, fromCache: true }
  }

  const fresh = await getTaxonomy()
  writeCachedTaxonomy(fresh)
  return { taxonomy: fresh, fromCache: false }
}
