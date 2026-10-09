/**
 * /guest/dashboard — the research dashboard with made-up sample data.
 *
 * Unlike /dashboard this page needs no session and makes no dashboard request:
 * every number is generated in the browser. See GuestDashboardScreen.
 *
 * OWNER: Stream 2.
 */
import type { Metadata } from 'next'

import { GuestDashboardScreen } from './_components/GuestDashboardScreen'

export const metadata: Metadata = {
  title: 'Sample research dashboard · Guest mode · HSA Daily Patient Log',
  description: 'The HSA research dashboard, filled with made-up sample data.',
  // A page of convincing-looking figures is exactly what should not turn up
  // in a search result stripped of the "sample data" banner around it.
  robots: { index: false, follow: false },
}

export default function GuestDashboardPage() {
  return <GuestDashboardScreen />
}
