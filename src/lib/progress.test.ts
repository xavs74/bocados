import { describe, expect, it } from 'vitest'
import type { Entry } from '../db'
import { addDays } from './dates'
import type { Goals } from './nutrition'
import {
  FLOOR,
  dailyTotals,
  maintenanceEstimate,
  periodStats,
  suggestGoal,
  weeklyAverages,
  weightTrend,
  type DayTotals,
  type Weight,
} from './progress'

let id = 0
const entry = (date: string, kcal: number, macros = { carbs: 50, protein: 30, fat: 20 }): Entry => ({
  id: ++id,
  date,
  meal: 'lunch',
  foodId: 1,
  name: 'Comida',
  per100: { kcal, ...macros },
  grams: 100,
  amount: { quantity: 100 },
  createdAt: ++id,
})

const day = (date: string, kcal: number, macros = { carbs: 50, protein: 30, fat: 20 }): DayTotals => ({
  date,
  totals: { kcal, ...macros },
})

const weigh = (date: string, kg: number): Weight => ({ date, kg, createdAt: ++id })

describe('dailyTotals', () => {
  it('adds up each day and puts them oldest first', () => {
    const days = dailyTotals([entry('2026-09-10', 600), entry('2026-09-09', 700), entry('2026-09-10', 400)])
    expect(days.map((d) => [d.date, d.totals.kcal])).toEqual([
      ['2026-09-09', 700],
      ['2026-09-10', 1000],
    ])
    expect(days[1].totals.protein).toBe(60)
  })
})

describe('periodStats', () => {
  const days = [day('2026-09-01', 2100), day('2026-09-02', 2600), day('2026-09-03', 300), day('2026-09-04', 2200), day('2026-09-20', 5000)]

  it('averages the logged days inside the period', () => {
    const s = periodStats(days, '2026-09-01', '2026-09-14', 2200)
    // 300 kcal is an abandoned day, and the 20th is outside the period.
    expect(s.logged).toBe(3)
    expect(s.days).toBe(14)
    expect(s.meanKcal).toBe(2300)
  })

  it('counts days within 10 % of the goal', () => {
    // 2100 and 2200 are within 10 % of 2200; 2600 is not.
    expect(periodStats(days, '2026-09-01', '2026-09-14', 2200).onTarget).toBe(2)
  })

  it('reports nothing rather than dividing by zero when no day is logged', () => {
    const s = periodStats([], '2026-09-01', '2026-09-14', 2200)
    expect(s).toEqual({ days: 14, logged: 0, meanKcal: 0, onTarget: 0, meanMacros: { carbs: 0, protein: 0, fat: 0 } })
  })
})

describe('weeklyAverages', () => {
  it('gives one average per week, oldest first', () => {
    const days = [day('2026-09-01', 2000), day('2026-09-03', 2400), day('2026-09-08', 1800)]
    expect(weeklyAverages(days, '2026-09-01', 2)).toEqual([
      { start: '2026-09-01', meanKcal: 2200, logged: 2 },
      { start: '2026-09-08', meanKcal: 1800, logged: 1 },
    ])
  })
})

describe('weightTrend', () => {
  it('follows the line through the weigh-ins, not the last one', () => {
    // Down 1 kg over 4 weeks, with a 0.8 kg jump on the last day.
    const weights = [weigh('2026-09-01', 80), weigh('2026-09-08', 79.7), weigh('2026-09-15', 79.4), weigh('2026-09-22', 79), weigh('2026-09-29', 79.8)]
    const t = weightTrend(weights)!
    expect(t.kgPerWeek).toBeLessThan(0)
    expect(t.kgPerWeek).toBeGreaterThan(-0.2)
    expect(t.points).toBe(5)
    expect(t.span).toBe(28)
  })

  it('works with two weigh-ins a week', () => {
    // 0.5 kg a week down, weighed Mondays and Thursdays for three weeks.
    const weights = [
      weigh('2026-09-07', 80),
      weigh('2026-09-10', 79.8),
      weigh('2026-09-14', 79.5),
      weigh('2026-09-17', 79.3),
      weigh('2026-09-21', 79),
      weigh('2026-09-24', 78.8),
    ]
    const t = weightTrend(weights)!
    expect(t.kgPerWeek).toBeCloseTo(-0.5, 1)
  })

  it('needs two weigh-ins on different days', () => {
    expect(weightTrend([])).toBeNull()
    expect(weightTrend([weigh('2026-09-01', 80)])).toBeNull()
    expect(weightTrend([weigh('2026-09-01', 80), weigh('2026-09-01', 79)])).toBeNull()
  })
})

describe('maintenanceEstimate', () => {
  it('adds back the energy the weight loss came from', () => {
    // Losing 0.5 kg a week on 2000 kcal means burning about 2550.
    expect(maintenanceEstimate(2000, -0.5 / 7)).toBe(2550)
  })

  it('subtracts the energy that went into weight gained', () => {
    expect(maintenanceEstimate(3000, 0.5 / 7)).toBe(2450)
  })

  it('is the intake itself when weight holds', () => {
    expect(maintenanceEstimate(2200, 0)).toBe(2200)
  })
})

const goals = (over: Partial<Goals> = {}): Goals => ({
  kcal: 2200,
  split: { carbs: 45, protein: 25, fat: 30 },
  mode: 'calculated',
  set: true,
  profile: { sex: 'male', age: 40, heightCm: 178, weightKg: 80, activity: 'light', formula: 'mifflin', adjustment: -500 },
  ...over,
})

const weeks = (from: string, count: number, kcal: number) => Array.from({ length: count * 7 }, (_, i) => day(addDays(from, i), kcal))

describe('suggestGoal', () => {
  const stats = (kcal: number, logged = 18) => ({ days: 21, logged, meanKcal: kcal, onTarget: logged, meanMacros: { carbs: 0, protein: 0, fat: 0 } })
  const threeWeeks = [weigh('2026-09-01', 80), weigh('2026-09-08', 79.9), weigh('2026-09-15', 79.8), weigh('2026-09-22', 79.8)]

  it('lowers a goal that was set too high', () => {
    // 2180 kcal and barely any loss: they burn about 2250, not the 2700 assumed.
    const s = suggestGoal({ goals: goals(), stats: stats(2180), trend: weightTrend(threeWeeks), adjustment: -500 })
    expect(s.kind).toBe('suggestion')
    if (s.kind !== 'suggestion') return
    expect(s.maintenance).toBeGreaterThan(2200)
    expect(s.maintenance).toBeLessThan(2300)
    // 2260 − 500 = 1760, which is also as far as one step may move the goal.
    expect(s.kcal).toBe(1760)
  })

  it('moves the goal by at most a fifth in one step', () => {
    const s = suggestGoal({ goals: goals({ kcal: 3000 }), stats: stats(2180), trend: weightTrend(threeWeeks), adjustment: -500 })
    if (s.kind !== 'suggestion') throw new Error('expected a suggestion')
    expect(s.kcal).toBe(2400) // not the 1760 the arithmetic asks for
    expect(s.clamped).toBe(true)
  })

  it('offers the goal the data points to when it is inside the cap', () => {
    // Losing 0.7 kg a week on 2100 kcal: maintenance is about 2870.
    const fast = [weigh('2026-09-01', 80), weigh('2026-09-08', 79.3), weigh('2026-09-15', 78.6), weigh('2026-09-22', 77.9)]
    const s = suggestGoal({ goals: goals({ kcal: 2500 }), stats: stats(2100), trend: weightTrend(fast), adjustment: -500 })
    if (s.kind !== 'suggestion') throw new Error('expected a suggestion')
    expect(s.kcal).toBe(2370)
    expect(s.clamped).toBe(false)
    expect(s.kgPerWeek).toBeCloseTo(-0.7, 1)
  })

  it('says nothing when the change would be small', () => {
    // Holding weight on 2200 with no adjustment: the goal is already right.
    const flat = [weigh('2026-09-01', 80), weigh('2026-09-08', 80), weigh('2026-09-15', 80), weigh('2026-09-22', 80)]
    expect(suggestGoal({ goals: goals({ kcal: 2200 }), stats: stats(2200), trend: weightTrend(flat), adjustment: 0 })).toEqual({
      kind: 'none',
      reason: 'small-change',
    })
  })

  it('waits for enough logged days and enough weigh-ins', () => {
    expect(suggestGoal({ goals: goals(), stats: stats(2180, 6), trend: weightTrend(threeWeeks), adjustment: -500 }).kind).toBe('none')
    expect(suggestGoal({ goals: goals(), stats: stats(2180), trend: null, adjustment: -500 })).toEqual({ kind: 'none', reason: 'few-weights' })
    const close = [weigh('2026-09-01', 80), weigh('2026-09-02', 79.9), weigh('2026-09-03', 79.8), weigh('2026-09-05', 79.7)]
    expect(suggestGoal({ goals: goals(), stats: stats(2180), trend: weightTrend(close), adjustment: -500 })).toEqual({
      kind: 'none',
      reason: 'weights-too-close',
    })
  })

  it('never suggests less than the basal rate or the floor', () => {
    // Gaining weight fast on very little food would otherwise point very low.
    const gaining = [weigh('2026-09-01', 80), weigh('2026-09-08', 80.8), weigh('2026-09-15', 81.6), weigh('2026-09-22', 82.4)]
    // The arithmetic asks for about 220 kcal a day; the basal rate stops it.
    const s = suggestGoal({ goals: goals({ kcal: 2000 }), stats: stats(1600), trend: weightTrend(gaining), adjustment: -500 })
    if (s.kind !== 'suggestion') throw new Error('expected a suggestion')
    expect(s.kcal).toBe(1720) // this profile's basal rate, rounded
    expect(s.kcal).toBeGreaterThanOrEqual(FLOOR.male)
    expect(s.clamped).toBe(true)
  })

  it('works without a calculated profile', () => {
    const manual = goals({ mode: 'manual', profile: undefined, kcal: 2500 })
    const fast = [weigh('2026-09-01', 80), weigh('2026-09-08', 79.3), weigh('2026-09-15', 78.6), weigh('2026-09-22', 77.9)]
    const s = suggestGoal({ goals: manual, stats: stats(2100), trend: weightTrend(fast), adjustment: -500 })
    if (s.kind !== 'suggestion') throw new Error('expected a suggestion')
    expect(s.estimated).toBeUndefined()
    expect(s.kcal).toBe(2370)
  })

  it('takes three weeks of real days to say anything', () => {
    const days = weeks('2026-09-01', 3, 2180)
    const s = periodStats(days, '2026-09-01', '2026-09-21', 2200)
    expect(s.logged).toBe(21)
    expect(suggestGoal({ goals: goals(), stats: s, trend: weightTrend(threeWeeks), adjustment: -500 }).kind).toBe('suggestion')
  })
})
