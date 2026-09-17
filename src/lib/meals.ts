import type { Meal } from '../db'

export function mealForNow(date = new Date()): Meal {
  const h = date.getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 19) return 'snack'
  return 'dinner'
}
