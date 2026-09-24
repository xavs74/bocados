import dishes from '../data/eatingOut.json'
import { db, type Food, type Serving } from '../db'
import { EATING_OUT_CATEGORY } from './categories'
import { matches } from './format'

/**
 * Eating out: a bar, a pizza place, a kebab. Nobody weighs a bocadillo, so
 * these are typical dishes with typical portions, average rather than exact.
 *
 * They live in the app rather than in everyone's food list, and only the ones
 * actually eaten become foods — the same way supermarket products do. That
 * keeps Alimentos as the person's own list instead of a menu they never asked
 * for.
 */

export interface Dish {
  name: string
  /** What it is: tapas, bocadillos, pizza and burgers, dishes, drinks, puddings. */
  group: string
  kcal: number
  carbs: number
  protein: number
  fat: number
  /** Grams of alcohol per 100 g, where that is where the calories come from. */
  alcohol?: number
  servings: Serving[]
}

export const DISHES = dishes as Dish[]

/** The rough one, for a meal nobody is going to describe dish by dish. */
export const ESTIMATE = DISHES[0]

export const SOURCE = 'fuera-de-casa'

/** Dishes whose name matches, best first, with the rough estimate never shown here. */
export function searchDishes(query: string, limit = 8): Dish[] {
  const q = query.trim()
  if (q.length < 2) return []
  return DISHES.filter((dish) => dish !== ESTIMATE && matches(dish.name, q)).slice(0, limit)
}

/**
 * Copies a dish into this person's foods, once. Eating the same thing again
 * finds the food that is already there, so it gathers no duplicates and turns
 * up under "Lo de siempre" like anything else.
 */
export async function saveDish(dish: Dish): Promise<Food> {
  const existing = await db.foods.where('name').equals(dish.name).first()
  if (existing) return existing

  const food = {
    name: dish.name,
    kcal: dish.kcal,
    carbs: dish.carbs,
    protein: dish.protein,
    fat: dish.fat,
    ...(dish.alcohol ? { alcohol: dish.alcohol } : {}),
    servings: dish.servings,
    category: EATING_OUT_CATEGORY,
    source: SOURCE,
  }
  const id = await db.foods.add(food as Food)
  return { ...food, id } as Food
}
