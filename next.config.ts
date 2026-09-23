import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // better-sqlite3 is a native module and must not be bundled into the server
  // build; Next would otherwise try to trace and inline the .node binary.
  // pg is external for the same reason in production (Vercel + Supabase):
  // it resolves its driver dynamically and must stay in node_modules.
  serverExternalPackages: [
    'better-sqlite3',
    '@prisma/adapter-better-sqlite3',
    'pg',
    '@prisma/adapter-pg',
  ],
}

export default nextConfig
