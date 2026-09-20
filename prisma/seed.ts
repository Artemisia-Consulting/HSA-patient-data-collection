/**
 * Seeds the condition taxonomy from the contract file into the `Condition`
 * table. Idempotent: it upserts by code and only deactivates codes that have
 * been removed from the contract, so it is safe to re-run against a live
 * database mid-collection. It never touches practitioner or log data.
 *
 * Run with: npm run db:seed
 */
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

import { PrismaClient } from '../src/generated/prisma/client'
import { CONDITION_TAXONOMY, isOtherCondition } from '../src/lib/contract/taxonomy'

try {
  process.loadEnvFile()
} catch {
  // Real env vars are already present in CI / production.
}

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
})
const prisma = new PrismaClient({ adapter })

async function main() {
  let created = 0
  let updated = 0

  for (const condition of CONDITION_TAXONOMY) {
    const data = {
      category: condition.category,
      label: condition.label,
      synonyms: (condition.synonyms ?? []).join('|'),
      rank: condition.rank ?? 100,
      isActive: true,
    }

    const existing = await prisma.condition.findUnique({
      where: { code: condition.code },
    })

    await prisma.condition.upsert({
      where: { code: condition.code },
      create: { code: condition.code, ...data },
      update: data,
    })

    if (existing) updated += 1
    else created += 1
  }

  // A code dropped from the contract is retired rather than deleted, so
  // historical entries that reference it still resolve to a label.
  const contractCodes = CONDITION_TAXONOMY.map((c) => c.code)
  const retired = await prisma.condition.updateMany({
    where: { code: { notIn: contractCodes }, isActive: true },
    data: { isActive: false },
  })

  const otherRows = CONDITION_TAXONOMY.filter((c) => isOtherCondition(c.code))

  console.log(
    `Taxonomy seeded: ${created} created, ${updated} updated, ${retired.count} retired.`,
  )
  console.log(
    `${CONDITION_TAXONOMY.length} conditions across 5 categories, ` +
      `${otherRows.length} "Other (specify)" fallbacks.`,
  )
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
