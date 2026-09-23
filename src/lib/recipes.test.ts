import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../db'
import { foodFromRecipe, perServing, recipeTotals, servingGrams } from './recipes'

const ingredient = (name: string, per100: [number, number, number, number], grams: number): Ingredient => ({
  foodId: 'f1',
  name,
  per100: { kcal: per100[0], carbs: per100[1], protein: per100[2], fat: per100[3] },
  grams,
  amount: { quantity: grams },
})

// 400 g of rice (dry) + 600 g of chicken breast, four servings.
const ingredients = [ingredient('Arroz blanco (crudo)', [352, 78.7, 7.1, 0.7], 400), ingredient('Pechuga de pollo (cruda)', [113, 0, 22.5, 2.6], 600)]

describe('recipeTotals', () => {
  it('adds up every ingredient', () => {
    const t = recipeTotals(ingredients)
    expect(t.kcal).toBeCloseTo(352 * 4 + 113 * 6)
    expect(t.protein).toBeCloseTo(7.1 * 4 + 22.5 * 6)
  })
})

describe('perServing', () => {
  it('divides by the number of servings', () => {
    expect(perServing(ingredients, 4).kcal).toBeCloseTo((352 * 4 + 113 * 6) / 4)
  })

  it('treats zero servings as one instead of dividing by zero', () => {
    expect(perServing(ingredients, 0).kcal).toBeCloseTo(352 * 4 + 113 * 6)
  })
})

describe('servingGrams', () => {
  it('splits the weight of the dish between the servings', () => {
    expect(servingGrams(ingredients, 4)).toBe(250)
  })
})

describe('foodFromRecipe', () => {
  it('builds a food with values per 100 g and a serving', () => {
    const food = foodFromRecipe({ name: 'Arroz con pollo', servings: 4, ingredients })
    expect(food).toMatchObject({ name: 'Arroz con pollo', category: 'Recetas', servings: [{ label: '1 ración', grams: 250 }] })
    // 2086 kcal over 1000 g of food.
    expect(food!.kcal).toBeCloseTo(208.6, 1)
    expect(food!.protein).toBeCloseTo(16.3, 1)
  })

  it('returns null when there are no ingredients yet', () => {
    expect(foodFromRecipe({ name: 'Vacía', servings: 2, ingredients: [] })).toBeNull()
  })
})
