import { db, type Food, type Ingredient, type Recipe } from '../db'
import { RECIPE_CATEGORY } from './categories'
import { scale, sum, type Nutrients } from './nutrition'

export const SERVING_LABEL = '1 ración'

export const totalGrams = (ingredients: Ingredient[]) => ingredients.reduce((g, i) => g + i.grams, 0)

/** Everything the whole recipe contains. */
export const recipeTotals = (ingredients: Ingredient[]): Nutrients => sum(ingredients.map((i) => scale(i.per100, i.grams)))

export function perServing(ingredients: Ingredient[], servings: number): Nutrients {
  const n = Math.max(servings, 1)
  const t = recipeTotals(ingredients)
  return { kcal: t.kcal / n, carbs: t.carbs / n, protein: t.protein / n, fat: t.fat / n }
}

/** Grams one serving weighs, assuming nothing is lost while cooking. */
export function servingGrams(ingredients: Ingredient[], servings: number): number {
  return totalGrams(ingredients) / Math.max(servings, 1)
}

/**
 * The food that mirrors a recipe: values per 100 g of the dish, plus a serving
 * so it can be logged as "1 ración". Null when there's nothing to compute from.
 */
export function foodFromRecipe(recipe: Pick<Recipe, 'name' | 'servings' | 'ingredients'>): Omit<Food, 'id'> | null {
  const grams = totalGrams(recipe.ingredients)
  if (grams <= 0) return null
  const t = recipeTotals(recipe.ingredients)
  const per100 = (value: number) => Math.round((value / grams) * 100 * 10) / 10
  return {
    name: recipe.name.trim(),
    kcal: per100(t.kcal),
    carbs: per100(t.carbs),
    protein: per100(t.protein),
    fat: per100(t.fat),
    servings: [{ label: SERVING_LABEL, grams: Math.round(servingGrams(recipe.ingredients, recipe.servings)) }],
    category: RECIPE_CATEGORY,
  }
}

/** Creates or updates a recipe together with the food that mirrors it. */
export async function saveRecipe(recipe: Pick<Recipe, 'name' | 'servings' | 'ingredients'> & { id?: number; foodId?: number }): Promise<number> {
  const food = foodFromRecipe(recipe)
  return db.transaction('rw', db.recipes, db.foods, async () => {
    const id = recipe.id ?? (await db.recipes.add({ ...recipe, createdAt: Date.now() } as Recipe))
    let foodId = recipe.foodId
    if (food) {
      if (foodId && (await db.foods.get(foodId))) await db.foods.update(foodId, food)
      else foodId = await db.foods.add(food as Food)
      await db.foods.update(foodId!, { recipeId: id })
    }
    await db.recipes.update(id, { ...recipe, id, foodId })
    return id
  })
}

/** Removes a recipe and its food. Days already logged keep their numbers. */
export async function deleteRecipe(recipe: Recipe): Promise<void> {
  await db.transaction('rw', db.recipes, db.foods, async () => {
    if (recipe.foodId) await db.foods.delete(recipe.foodId)
    await db.recipes.delete(recipe.id)
  })
}
