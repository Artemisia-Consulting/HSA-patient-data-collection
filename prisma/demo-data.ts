/**
 * Fills the database with plausible October data so the dashboard can be seen
 * working before any real practitioner has logged anything.
 *
 * Development only — it refuses to run when NODE_ENV is production. It touches
 * nothing but its own rows: every practitioner it creates has an
 * `@demo.hsa.invalid` address, and re-running it deletes only those
 * practitioners' logs before regenerating. Real sign-ups are never affected.
 *
 * The numbers are produced by a seeded generator, so two runs give the same
 * dataset and a screenshot of the dashboard stays reproducible.
 *
 * Run with:  npm run db:demo
 * Remove with: npm run db:demo -- --clear
 */
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

import { PrismaClient } from '../src/generated/prisma/client'
import { CONDITION_TAXONOMY } from '../src/lib/contract/taxonomy'

try {
  process.loadEnvFile()
} catch {
  // Real env vars are already present in CI / production.
}

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to write demo data to a production database.')
  process.exit(1)
}

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./dev.db' }),
})

const DEMO_DOMAIN = '@demo.hsa.invalid'
const DAYS = 24

const PRACTITIONERS = [
  { name: 'Demo: Nandi Khumalo', province: 'Gauteng' },
  { name: 'Demo: Pieter van Wyk', province: 'Western Cape' },
  { name: 'Demo: Aisha Patel', province: 'KwaZulu-Natal' },
  { name: 'Demo: Thabo Molefe', province: 'Gauteng' },
  { name: 'Demo: Sarah Botha', province: 'Eastern Cape' },
  { name: 'Demo: Lerato Dlamini', province: 'Free State' },
] as const

/** Mulberry32 — small, seeded, and identical on every machine. */
function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = rng(20261001)

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]
}

/** Weighted pick: `[value, weight]` pairs. */
function weighted<T>(pairs: readonly (readonly [T, number])[]): T {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [value, weight] of pairs) {
    roll -= weight
    if (roll <= 0) return value
  }
  return pairs[pairs.length - 1][0]
}

function between(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

/** `count` consecutive SAST dates from the collection start, as yyyy-MM-dd. */
function dates(count: number): string[] {
  const start = process.env.COLLECTION_START_DATE ?? '2026-10-01'
  const [year, month, day] = start.split('-').map(Number)
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1, day + offset))
    return date.toISOString().slice(0, 10)
  })
}

/** Mental health and chronic disease dominate the real caseload; mirror that. */
const CATEGORY_WEIGHTS = [
  ['MENTAL_HEALTH', 30],
  ['NON_COMMUNICABLE_CHRONIC', 25],
  ['WOMENS_HEALTH_HORMONES', 20],
  ['COMMUNICABLE', 15],
  ['OTHER', 10],
] as const

function condition() {
  const category = weighted(CATEGORY_WEIGHTS)
  const inCategory = CONDITION_TAXONOMY.filter(
    (entry) => entry.category === category && !entry.code.endsWith('__OTHER'),
  )
  const chosen = pick(inCategory.length > 0 ? inCategory : CONDITION_TAXONOMY)

  return {
    category: chosen.category,
    conditionCode: chosen.code,
    diagnosisBasis: weighted([
      ['CLINICAL_DIAGNOSIS', 60],
      ['PATIENT_REPORTED_PRIOR', 28],
      ['PRESENTING_COMPLAINT_ONLY', 12],
    ] as const),
    alsoSeeingGp: weighted([
      ['YES', 45],
      ['NO', 40],
      ['UNSURE', 15],
    ] as const),
    referredByGp: weighted([
      ['YES', 18],
      ['NO', 52],
      ['NOT_APPLICABLE', 30],
    ] as const),
  }
}

async function clearDemoLogs(practitionerIds: string[]) {
  // Patient and condition rows cascade from the log.
  const { count } = await prisma.dailyLog.deleteMany({
    where: { practitionerId: { in: practitionerIds } },
  })
  return count
}

async function main() {
  const clearOnly = process.argv.includes('--clear')

  const practitioners = []
  for (const [index, person] of PRACTITIONERS.entries()) {
    const email = `demo${index + 1}${DEMO_DOMAIN}`
    practitioners.push(
      await prisma.practitioner.upsert({
        where: { email },
        create: {
          email,
          fullName: person.name,
          province: person.province,
          practiceName: `${person.province} Homoeopathy`,
          onboardedAt: new Date(),
        },
        update: { fullName: person.name, province: person.province },
      }),
    )
  }

  const ids = practitioners.map((p) => p.id)
  const removed = await clearDemoLogs(ids)

  if (clearOnly) {
    await prisma.practitioner.deleteMany({ where: { email: { endsWith: DEMO_DOMAIN } } })
    console.log(`Removed ${removed} demo log days and ${ids.length} demo practitioners.`)
    return
  }

  let logDays = 0
  let patientRows = 0
  let conditionRows = 0

  for (const logDate of dates(DAYS)) {
    // Sundays are not working days, and not everyone logs every day.
    const weekday = new Date(`${logDate}T00:00:00Z`).getUTCDay()
    if (weekday === 0) continue

    for (const practitioner of practitioners) {
      if (random() < 0.25) continue

      const newPatients = between(0, 6)
      const followUpPatients = between(1, 9)
      const patients = [
        ...Array.from({ length: newPatients }, (_, i) => ({
          patientType: 'NEW' as const,
          position: i + 1,
        })),
        ...Array.from({ length: followUpPatients }, (_, i) => ({
          patientType: 'FOLLOW_UP' as const,
          position: i + 1,
        })),
      ]

      await prisma.dailyLog.create({
        data: {
          practitionerId: practitioner.id,
          logDate,
          newPatients,
          followUpPatients,
          patients: {
            create: patients.map((patient) => {
              // Most patients are itemised with one condition; a few carry two,
              // and a few are counted without being itemised at all.
              const howMany = weighted([
                [1, 62],
                [2, 22],
                [0, 16],
              ] as const)
              conditionRows += howMany
              patientRows += 1
              return {
                ...patient,
                conditions: {
                  create: Array.from({ length: howMany }, () => condition()),
                },
              }
            }),
          },
        },
      })
      logDays += 1
    }
  }

  console.log(
    `Demo data: ${removed > 0 ? `replaced ${removed} day(s); ` : ''}` +
      `${logDays} log days, ${patientRows} patients, ${conditionRows} conditions ` +
      `across ${practitioners.length} demo practitioners.`,
  )
  console.log('Sign in at /researcher-signin to see it on the dashboard.')
}

main()
  .catch((error) => {
    console.error('Demo data failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
