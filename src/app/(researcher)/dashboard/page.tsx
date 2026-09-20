/**
 * /dashboard — the HSA research team's view of the October dataset (FR8).
 *
 * A thin server wrapper: the screen itself is a client component because the
 * filter, the charts and the table are one interactive unit. Rendering the
 * data server-side would mean a full page navigation per filter change.
 *
 * `noindex` because there is no reason for this to be in a search index even
 * though it refuses anonymous requests anyway.
 *
 * OWNERSHIP: Stream 2 (frontend).
 */
import type { Metadata } from 'next'

import { DashboardScreen } from './_components/DashboardScreen'

export const metadata: Metadata = {
  title: 'Research dashboard — HSA Daily Patient Log',
  description: 'Aggregate homeopathic practice data for the HSA October study.',
  robots: { index: false, follow: false },
}

// Live aggregates; nothing here may be prerendered at build time.
export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return <DashboardScreen />
}
