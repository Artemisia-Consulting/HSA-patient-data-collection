import './env'

import fs from 'node:fs'
import path from 'node:path'

import { CONDITION_TAXONOMY } from '@/lib/contract'
import { prisma } from '@/lib/db'
import { hashSessionToken } from '@/lib/server/auth'

/**
 * Test database.
 *
 * The schema is applied from `schema.sql`, generated with
 * `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.
 * Committing the DDL keeps the suite fast and hermetic — no Prisma CLI spawn
 * per worker — at the cost of one maintenance rule: regenerate it whenever
 * prisma/schema.prisma changes.
 */
const SCHEMA_PATH = path.join(process.cwd(), 'tests/backend/helpers/schema.sql')

let schemaApplied = false

export async function initTestDb(): Promise<void> {
  if (schemaApplied) return
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8')
  for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement)
  }
  schemaApplied = true
  await seedTaxonomy()
}

export async function seedTaxonomy(): Promise<void> {
  await prisma.condition.createMany({
    data: CONDITION_TAXONOMY.map((c) => ({
      code: c.code,
      category: c.category,
      label: c.label,
      synonyms: (c.synonyms ?? []).join('|'),
      rank: c.rank ?? 100,
      isActive: true,
    })),
  })
}

/** Wipe practitioner data between tests. The taxonomy is left in place. */
export async function resetDb(): Promise<void> {
  await prisma.conditionEntry.deleteMany()
  await prisma.patientEntry.deleteMany()
  await prisma.dailyLog.deleteMany()
  await prisma.session.deleteMany()
  await prisma.dayOverride.deleteMany()
  await prisma.reminderDispatch.deleteMany()
  await prisma.practitioner.deleteMany()
  // Better Auth's tables. Sessions and accounts cascade from the user.
  await prisma.authVerification.deleteMany()
  await prisma.authUser.deleteMany()
}

let sequence = 0

export async function createPractitioner(
  overrides: Partial<{
    email: string
    fullName: string
    province: string | null
    role: string
    onboardedAt: Date | null
  }> = {},
) {
  sequence += 1
  return prisma.practitioner.create({
    data: {
      email: overrides.email ?? `practitioner${sequence}@example.org`,
      fullName: overrides.fullName ?? `Practitioner ${sequence}`,
      province: overrides.province ?? 'Gauteng',
      role: overrides.role ?? 'PRACTITIONER',
      onboardedAt: overrides.onboardedAt ?? null,
    },
  })
}

export async function createResearcher() {
  return createPractitioner({
    email: `researcher${Date.now()}${sequence}@example.org`,
    role: 'RESEARCHER',
  })
}

/** Issue a session directly, bypassing the signup route. */
export async function issueSession(practitionerId: string): Promise<string> {
  const token = `test-token-${practitionerId}-${sequence++}`
  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      practitionerId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })
  return token
}
