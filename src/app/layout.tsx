import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HSA Daily Patient Log',
  description:
    'Homoeopathic Association of South Africa — October 2026 patient data collection.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HSA Log',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block pinch-zoom — that is an accessibility failure and costs
  // Lighthouse points the brief explicitly targets.
  maximumScale: 5,
  themeColor: '#2f6b4f',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  )
}
