'use client'

/**
 * The four charts. Each one answers a question the HSA report actually asks:
 *
 *   1. Trend      — did participation hold up across the month, or taper off?
 *   2. Category   — what is homeopathy carrying in this country?
 *   3. Basis      — how much of that is a practitioner's own diagnosis?
 *   4. Referral   — is this care the conventional system already knows about?
 *                   (Drawn by ConventionalCareChart: one share bar per question.)
 *
 * Colours are fixed hexes rather than CSS variables because recharts renders
 * to SVG attributes, and each one is chosen to stay legible on both the light
 * and the dark background. Axis text uses a mid-grey for the same reason.
 *
 * OWNER: Stream 2.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DashboardSummary } from '@/lib/contract/api'
import { DIAGNOSIS_BASIS_LABELS } from '@/lib/contract/enums'
import { ConventionalCareChart } from './ConventionalCareChart'
import { shortLogDate } from './format'

const AXIS = '#9ca3af'
const GRID = '#9ca3af33'

const NEW = '#0f766e'
const RETURNING = '#84cc16'
const BAR = '#0f766e'

/** Enough distinct hues for the five categories and the three bases. */
const SLICES = ['#0f766e', '#84cc16', '#f59e0b', '#7c3aed', '#64748b']

const TOOLTIP = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #d4d4d4',
    fontSize: 13,
    color: '#171717',
    background: '#ffffff',
  },
} as const

function Panel({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      {hint ? (
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
      ) : null}
      <div className="mt-3 h-64">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
      {children}
    </div>
  )
}

export function DashboardCharts({ summary }: { summary: DashboardSummary }) {
  const trend = summary.byDate.map((day) => ({
    date: shortLogDate(day.logDate),
    New: day.newPatients,
    Returning: day.followUpPatients,
  }))

  const categories = summary.byCategory
    .map((row) => ({ label: row.label, entries: row.entries }))
    .sort((a, b) => b.entries - a.entries)

  // The legend carries each share, so the donut reads without hovering.
  const basisTotal = summary.byDiagnosisBasis.reduce((sum, row) => sum + row.entries, 0)
  const bases = summary.byDiagnosisBasis
    .map((row) => ({
      label: `${DIAGNOSIS_BASIS_LABELS[row.diagnosisBasis]} · ${Math.round(
        (row.entries / Math.max(1, basisTotal)) * 100,
      )}%`,
      entries: row.entries,
    }))
    .filter((row) => row.entries > 0)

  const anyEntries = summary.totals.conditionEntries > 0

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel
        title="Patients per day"
        hint="New and returning patients, by the date they were seen."
      >
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} />
              <YAxis
                allowDecimals={false}
                tick={{ fill: AXIS, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip {...TOOLTIP} cursor={{ fill: GRID }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="New" stackId="patients" fill={NEW} radius={[0, 0, 0, 0]} />
              <Bar
                dataKey="Returning"
                stackId="patients"
                fill={RETURNING}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty>No days match these filters.</Empty>
        )}
      </Panel>

      <Panel
        title="Conditions by category"
        hint="One count per condition recorded, not per patient."
      >
        {anyEntries ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={categories}
              layout="vertical"
              margin={{ top: 4, right: 32, bottom: 0, left: 8 }}
            >
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: AXIS, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={150}
                tick={{ fill: AXIS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip {...TOOLTIP} cursor={{ fill: GRID }} />
              <Bar dataKey="entries" name="Conditions" fill={BAR} radius={[0, 4, 4, 0]}>
                {/* The count at the end of each bar, so nobody reads it off the axis. */}
                <LabelList dataKey="entries" position="right" fill={AXIS} fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty>No conditions match these filters.</Empty>
        )}
      </Panel>

      <Panel title="How the diagnosis was arrived at" hint="Share of all conditions recorded.">
        {bases.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={bases}
                dataKey="entries"
                nameKey="label"
                innerRadius="45%"
                outerRadius="75%"
                paddingAngle={2}
              >
                {bases.map((row, index) => (
                  <Cell key={row.label} fill={SLICES[index % SLICES.length]} />
                ))}
              </Pie>
              <Tooltip {...TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <Empty>No conditions match these filters.</Empty>
        )}
      </Panel>

      <Panel
        title="Conventional medical care"
        hint="Answers to the two referral questions, as a share of all conditions recorded."
      >
        {anyEntries ? (
          <ConventionalCareChart summary={summary} />
        ) : (
          <Empty>No conditions match these filters.</Empty>
        )}
      </Panel>
    </div>
  )
}
