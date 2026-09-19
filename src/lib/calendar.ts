import { isoDate } from './dates'

/**
 * The weeks shown for a month, Monday first, padded with null so every week
 * has seven cells. `month` is 0-based.
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1)
  const days = new Date(year, month + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // Monday = 0
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(isoDate(new Date(year, month, d)))
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export type DayStatus = 'empty' | 'low' | 'good' | 'high'

/** Within 10 % of the goal counts as on target. */
export const DAY_TOLERANCE = 0.1

/** Over the goal by more than that margin: only then is it shown as a warning. */
export const wellOver = (kcal: number, goal: number) => goal > 0 && kcal > goal * (1 + DAY_TOLERANCE)

export function dayStatus(kcal: number | undefined, goal: number): DayStatus {
  if (!kcal) return 'empty'
  if (goal <= 0) return 'good'
  const ratio = kcal / goal
  if (ratio < 1 - DAY_TOLERANCE) return 'low'
  if (ratio > 1 + DAY_TOLERANCE) return 'high'
  return 'good'
}
