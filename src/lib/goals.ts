import { DEFAULT_GOALS } from '../db'
import type { Goals } from './nutrition'

/**
 * Whether these goals are the person's own. Installs from before the flag
 * existed count as set if the goal was changed from the untouched default,
 * so only phones still on 1,700 kcal see the first-run setup.
 */
export function goalsAreSet(goals: Goals | undefined): boolean {
  if (!goals) return false
  if (goals.set !== undefined) return goals.set
  const d = DEFAULT_GOALS
  return (
    goals.mode === 'calculated' ||
    goals.kcal !== d.kcal ||
    goals.split.carbs !== d.split.carbs ||
    goals.split.protein !== d.split.protein ||
    goals.split.fat !== d.split.fat
  )
}
