/**
 * GET /api/taxonomy — FR4, rubric item 5 tier 3.
 *
 * Served from the `Condition` table rather than the TypeScript seed file, so
 * the research team can add or retire a condition mid-October by editing one
 * row — no redeploy, no app store round trip for the installed PWA.
 *
 * Cacheable on purpose. The list is ~45 rows that change almost never, and the
 * practitioners using this are on South African mobile data. `version` is a
 * content hash of the active rows and is served as the ETag, so a revalidation
 * on a poor connection costs a 304 with an empty body rather than the payload.
 *
 * Unauthenticated: it is a reference list with nothing personal in it, and
 * requiring a session would mean the signup screen could not preload it.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { NextResponse } from 'next/server'

import { taxonomyResponseSchema } from '@/lib/contract'
import { withRoute } from '@/lib/server/errors'
import { jsonResponse } from '@/lib/server/http'
import { getTaxonomy } from '@/lib/server/taxonomy'

// The list lives in the database, so this must not be prerendered at build time.
export const dynamic = 'force-dynamic'

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400'

export const GET = withRoute(async (request: Request): Promise<NextResponse> => {
  const taxonomy = await getTaxonomy()
  const etag = `"${taxonomy.version}"`

  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': CACHE_CONTROL },
    })
  }

  return jsonResponse(taxonomyResponseSchema, taxonomy, {
    headers: { ETag: etag, 'Cache-Control': CACHE_CONTROL },
  })
})
