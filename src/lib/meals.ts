import { DEFAULT_MEALS, MEALS, type Meal } from '../db'

/** Keeps a saved list valid and in the order of the day; at least one meal stays on. */
export function normalizeMeals(value: unknown): Meal[] {
  const list = Array.isArray(value) ? MEALS.filter((m) => value.includes(m)) : []
  return list.length ? list : DEFAULT_MEALS
}

/** Hour of the day each meal usually starts. */
const STARTS: Record<Meal, number> = { breakfast: 6, midmorning: 10, lunch: 13, snack: 17, dinner: 20, latenight: 23 }

/** The enabled meal someone is most likely logging at this time. */
export function mealForNow(enabled: Meal[] = DEFAULT_MEALS, date = new Date()): Meal {
  const hour = date.getHours() + date.getMinutes() / 60
  // The latest meal that has already started; before the first one, the first.
  const started = enabled.filter((m) => STARTS[m] <= hour)
  return started.at(-1) ?? enabled[0]
}

/** Enabled meals, plus any others that already hold food that day, so nothing logged is hidden. */
export function visibleMeals(enabled: Meal[], used: Iterable<Meal>): Meal[] {
  const set = new Set<Meal>([...enabled, ...used])
  return MEALS.filter((m) => set.has(m))
}
