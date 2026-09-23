/**
 * Creates (or promotes) a RESEARCHER account.
 *
 * `POST /api/auth/researcher` checks the shared code and then signs you in as
 * the oldest researcher row — so without one, a correct code still returns
 * "No researcher account exists on this deployment yet". This is the script
 * that makes that row.
 *
 * Kept out of `seed.ts` on purpose: that script seeds the condition taxonomy
 * and is safe to re-run against the live database mid-collection precisely
 * because it never touches practitioner data. Creating accounts is a separate,
 * deliberate act.
 *
 * Run with:
 *   npm run db:researcher -- research@hsa.org.za "HSA Research Team"
 *   npm run db:researcher            # uses RESEARCHER_EMAIL, or the dev default
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { createDbAdapter } from '../src/lib/db-adapter'

try {
  process.loadEnvFile()
} catch {
  // Real env vars are already present in CI / production.
}

// Local runs create the account on dev.db; `npm run db:researcher:prod`
// runs this file against the production database through
// scripts/with-prod-db.mjs.
const prisma = new PrismaClient({ adapter: createDbAdapter() })

const email = (
  process.argv[2] ??
  process.env.RESEARCHER_EMAIL ??
  'research@hsa.local'
)
  .trim()
  .toLowerCase()

const fullName = process.argv[3] ?? 'HSA Research Team'

async function main() {
  const existing = await prisma.practitioner.findUnique({ where: { email } })

  if (existing) {
    if (existing.role === 'RESEARCHER') {
      console.log(`${email} is already a researcher (${existing.id}).`)
      return
    }
    // Promoting an existing practitioner keeps their logs; it does not move
    // them out of the dataset, it only adds the dashboard to what they can see.
    await prisma.practitioner.update({
      where: { email },
      data: { role: 'RESEARCHER' },
    })
    console.log(`Promoted ${email} to RESEARCHER (${existing.id}).`)
    return
  }

  const created = await prisma.practitioner.create({
    data: { email, fullName, role: 'RESEARCHER' },
  })
  console.log(`Created researcher ${email} (${created.id}).`)
  console.log('Sign in at /researcher-signin with the RESEARCHER_CODE for this deployment.')
}

main()
  .catch((error) => {
    console.error('Could not create the researcher account:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
