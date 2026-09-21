import type { Entry, Weight } from '../db'
import { DAY_TOLERANCE } from './calendar'
import { addDays } from './dates'
import { bmr, isComplete, type Profile } from './energy'
import { scale, sum, type Goals, type MacroKey, type Nutrients } from './nutrition'
import { referenceWeight, splitFromProtein } from './protein'

export type { Weight }

/** A day counts as logged from here up. Below it, the day was abandoned rather than tiny. */
export const LOGGED_FLOOR = 500

/** Energy in a kilo of body mass, the usual figure for turning weight change into calories. */
export const KCAL_PER_KG = 7700

export interface DayTotals {
  date: string
  totals: Nutrients
}

/** Per-day totals for the days that have entries, oldest first. */
export function dailyTotals(entries: Entry[]): DayTotals[] {
  const byDate = new Map<string, Nutrients[]>()
  for (const e of entries) {
    const day = byDate.get(e.date)
    const n = scale(e.per100, e.grams)
    if (day) day.push(n)
    else byDate.set(e.date, [n])
  }
  return [...byDate.entries()]
    .map(([date, items]) => ({ date, totals: sum(items) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface PeriodStats {
  /** Days in the period, whether logged or not. */
  days: number
  logged: number
  /** Mean kcal of the logged days, or 0 when there are none. */
  meanKcal: number
  /** Logged days within the goal's margin. */
  onTarget: number
  /** Mean grams per macro over the logged days. */
  meanMacros: Record<MacroKey, number>
}

/** How the period went: only logged days count, so a skipped day is not a day of fasting. */
export function periodStats(days: DayTotals[], from: string, to: string, goal: number): PeriodStats {
  const inPeriod = days.filter((d) => d.date >= from && d.date <= to && d.totals.kcal >= LOGGED_FLOOR)
  const span = daysBetween(from, to) + 1
  if (inPeriod.length === 0) {
    return { days: span, logged: 0, meanKcal: 0, onTarget: 0, meanMacros: { carbs: 0, protein: 0, fat: 0 } }
  }
  const mean = (pick: (n: Nutrients) => number) => inPeriod.reduce((a, d) => a + pick(d.totals), 0) / inPeriod.length
  return {
    days: span,
    logged: inPeriod.length,
    meanKcal: Math.round(mean((n) => n.kcal)),
    onTarget: goal > 0 ? inPeriod.filter((d) => Math.abs(d.totals.kcal - goal) <= goal * DAY_TOLERANCE).length : 0,
    meanMacros: {
      carbs: Math.round(mean((n) => n.carbs)),
      protein: Math.round(mean((n) => n.protein)),
      fat: Math.round(mean((n) => n.fat)),
    },
  }
}

/** Mean kcal of each week in the period, oldest first, for the small bars. */
export function weeklyAverages(days: DayTotals[], from: string, weeks: number): { start: string; meanKcal: number; logged: number }[] {
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(from, i * 7)
    const end = addDays(start, 6)
    const week = days.filter((d) => d.date >= start && d.date <= end && d.totals.kcal >= LOGGED_FLOOR)
    const meanKcal = week.length ? Math.round(week.reduce((a, d) => a + d.totals.kcal, 0) / week.length) : 0
    return { start, meanKcal, logged: week.length }
  })
}

export interface WeightTrend {
  /** Kilos per day: negative while losing. */
  slope: number
  kgPerWeek: number
  /** The trend line's value on the first and last day of the period. */
  from: number
  to: number
  points: number
  /** Days between the first and last weigh-in. */
  span: number
}

/**
 * A straight line through the weigh-ins (least squares). Weight swings about a
 * kilo with water and salt, so the line, not the last reading, is the signal.
 * Null with fewer than two weigh-ins, or when they are all from one day.
 */
export function weightTrend(weights: Weight[]): WeightTrend | null {
  if (weights.length < 2) return null
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0].date
  const xs = sorted.map((w) => daysBetween(first, w.date))
  const span = xs[xs.length - 1]
  if (span === 0) return null

  const n = sorted.length
  const meanX = xs.reduce((a, x) => a + x, 0) / n
  const meanY = sorted.reduce((a, w) => a + w.kg, 0) / n
  let top = 0
  let bottom = 0
  for (let i = 0; i < n; i++) {
    top += (xs[i] - meanX) * (sorted[i].kg - meanY)
    bottom += (xs[i] - meanX) ** 2
  }
  const slope = top / bottom
  const intercept = meanY - slope * meanX
  return {
    slope,
    kgPerWeek: round(slope * 7, 2),
    from: round(intercept, 1),
    to: round(intercept + slope * span, 1),
    points: n,
    span,
  }
}

/**
 * What the person actually burns per day, from their own data: what they ate,
 * minus the energy the weight change accounts for. It replaces the formula's
 * estimate, which is commonly 10–15 % out for an individual.
 */
export function maintenanceEstimate(meanKcal: number, slopeKgPerDay: number): number {
  return Math.round((meanKcal - slopeKgPerDay * KCAL_PER_KG) / 10) * 10
}

/** Enough data for a suggestion to mean anything. */
export const NEEDS = {
  days: 14,
  /** The window the suggestion looks at. */
  checkDays: 21,
  /** How long a suggestion stays away once accepted or put off. */
  snoozeDays: 14,
  loggedDays: 10,
  weighIns: 4,
  /** Days between the first and last weigh-in. */
  weightSpan: 14,
  /** Below this the difference is noise. */
  minChange: 100,
  /** The most a single suggestion may move the goal. */
  maxChange: 0.2,
}

/** Nobody is sent below this, whatever the arithmetic says. */
export const FLOOR: Record<Profile['sex'], number> = { female: 1200, male: 1500 }

export type SuggestionReason = 'few-days' | 'few-weights' | 'weights-too-close' | 'small-change'

export type Suggestion =
  | { kind: 'none'; reason: SuggestionReason }
  | {
      kind: 'suggestion'
      /** The goal to offer. */
      kcal: number
      /** What they actually burn, by their own data. */
      maintenance: number
      /** What the formula thought, when there is a calculated goal. */
      estimated?: number
      meanKcal: number
      kgPerWeek: number
      days: number
      /** True when a guardrail, not the arithmetic, decided the number. */
      clamped: boolean
    }

interface SuggestInput {
  goals: Goals
  stats: PeriodStats
  trend: WeightTrend | null
  /** kcal per day to add to maintenance; the profile's when there is one. */
  adjustment: number
}

/**
 * The goal the person's own weeks point to, or why there isn't one yet. It only
 * ever suggests: applying it stays a decision made in the app.
 */
export function suggestGoal({ goals, stats, trend, adjustment }: SuggestInput): Suggestion {
  if (stats.days < NEEDS.days || stats.logged < NEEDS.loggedDays) return { kind: 'none', reason: 'few-days' }
  if (!trend || trend.points < NEEDS.weighIns) return { kind: 'none', reason: 'few-weights' }
  if (trend.span < NEEDS.weightSpan) return { kind: 'none', reason: 'weights-too-close' }

  const maintenance = maintenanceEstimate(stats.meanKcal, trend.slope)
  const wanted = maintenance + adjustment
  // Without a full profile there is no basal rate to compare with, so the
  // lower of the two floors applies.
  const profile = isComplete(goals.profile) ? goals.profile : null
  const limit = goals.kcal * NEEDS.maxChange
  const floor = profile ? Math.max(Math.round(bmr(profile)), FLOOR[profile.sex]) : FLOOR.female
  const capped = Math.min(Math.max(wanted, goals.kcal - limit), goals.kcal + limit)
  const kcal = Math.round(Math.max(capped, floor) / 10) * 10

  if (Math.abs(kcal - goals.kcal) < NEEDS.minChange) return { kind: 'none', reason: 'small-change' }

  return {
    kind: 'suggestion',
    kcal,
    maintenance,
    estimated: goals.mode === 'calculated' && profile ? goals.kcal - adjustment : undefined,
    meanKcal: stats.meanKcal,
    kgPerWeek: trend.kgPerWeek,
    days: stats.days,
    clamped: kcal !== Math.round(wanted / 10) * 10,
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000)
}

function round(n: number, places: number): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/**
 * The goals after accepting a suggestion. The burn is stored as the goal minus
 * the deficit or surplus, so a goal built from the profile keeps matching the
 * number that was offered, even when a guardrail moved it. The latest weigh-in
 * becomes the profile's weight, which is what protein per kilo is counted on.
 */
export function applySuggestion(goals: Goals, kcal: number, adjustment: number, weightKg?: number): Goals {
  const profile = goals.profile ? { ...goals.profile, ...(weightKg ? { weightKg } : {}) } : goals.profile
  const next: Goals = { ...goals, kcal, measuredTdee: kcal - adjustment, profile, set: true }
  if (!next.proteinPerKg || !isComplete(next.profile)) return next
  return { ...next, split: splitFromProtein(kcal, referenceWeight(next.profile).kg, next.proteinPerKg).split }
}
