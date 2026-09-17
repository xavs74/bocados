import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_GOALS, db } from './db'
import type { Goals } from './lib/nutrition'

export function useGoals(): Goals {
  const row = useLiveQuery(() => db.settings.get('goals'))
  return (row?.value as Goals | undefined) ?? DEFAULT_GOALS
}

export async function saveGoals(goals: Goals) {
  await db.settings.put({ key: 'goals', value: goals })
}
