import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // better-sqlite3 is a native module and must not be bundled into the server
  // build; Next would otherwise try to trace and inline the .node binary.
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3'],
}

export default nextConfig
