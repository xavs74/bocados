import { goalsAreSet } from './lib/goals'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { DEFAULT_GOALS, db, getDbStatus, watchDbStatus, type DbStatus, type Meal } from './db'
import { normalizeMeals } from './lib/meals'
import type { Goals } from './lib/nutrition'

/** Whether the database opened, so a stuck app can say so instead of looking empty. */
export function useDbStatus(): DbStatus {
  return useSyncExternalStore(watchDbStatus, getDbStatus, () => 'open' as DbStatus)
}

export function useGoals(): Goals {
  const row = useLiveQuery(() => db.settings.get('goals'))
  return (row?.value as Goals | undefined) ?? DEFAULT_GOALS
}

/** The goals plus whether they're the person's own; `loaded` is false until the database answers. */
export function useGoalsState(): { goals: Goals; set: boolean; loaded: boolean } {
  const row = useLiveQuery(() => db.settings.get('goals').then((r) => r ?? null))
  const goals = (row?.value as Goals | undefined) ?? DEFAULT_GOALS
  return { goals, set: goalsAreSet(row?.value as Goals | undefined), loaded: row !== undefined }
}

/** Saving goals from the app always means the person chose them. */
export async function saveGoals(goals: Goals) {
  await db.settings.put({ key: 'goals', value: { ...goals, set: true } })
}

/** The meals this person uses, in the order of the day. */
export function useMeals(): Meal[] {
  const row = useLiveQuery(() => db.settings.get('meals'))
  return normalizeMeals(row?.value)
}

export async function saveMeals(meals: Meal[]) {
  await db.settings.put({ key: 'meals', value: normalizeMeals(meals) })
}
