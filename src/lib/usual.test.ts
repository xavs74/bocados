import { describe, expect, it } from 'vitest'
import type { Entry, Food, Meal } from '../db'
import { usualFoods } from './usual'

const food = (id: number, name: string): Food => ({ id, name, servings: [], kcal: 100, carbs: 10, protein: 5, fat: 2 })
const foods = new Map([food(1, 'Leche entera'), food(2, 'Pan blanco'), food(3, 'Café'), food(4, 'Manzana')].map((f) => [f.id, f]))

let id = 0
const eat = (foodId: number, date: string, grams: number, meal: Meal = 'breakfast'): Entry => ({
  id: ++id,
  date,
  meal,
  foodId,
  name: foods.get(foodId)?.name ?? 'Borrado',
  per100: { kcal: 100, carbs: 10, protein: 5, fat: 2 },
  grams,
  amount: { quantity: grams },
  createdAt: id,
})

const today = '2026-09-19'

describe('usualFoods', () => {
  it('needs a food on two days of the meal, most frequent first', () => {
    const entries = [
      eat(1, '2026-09-10', 250),
      eat(1, '2026-09-12', 250),
      eat(1, '2026-09-15', 250),
      eat(2, '2026-09-14', 60),
      eat(2, '2026-09-18', 80),
      eat(3, '2026-09-18', 100), // only once
      eat(4, '2026-09-17', 150, 'snack'),
      eat(4, '2026-09-18', 150, 'snack'), // another meal
    ]
    const usual = usualFoods(entries, 'breakfast', today, foods)
    expect(usual.map((u) => [u.food.name, u.days])).toEqual([
      ['Leche entera', 3],
      ['Pan blanco', 2],
    ])
  })

  it('suggests the amount used the last time', () => {
    const entries = [eat(2, '2026-09-18', 80), eat(2, '2026-09-14', 60)]
    expect(usualFoods(entries, 'breakfast', today, foods)[0].amount).toEqual({ quantity: 80 })
  })

  it('leaves out what is already in the meal today', () => {
    const entries = [eat(1, '2026-09-17', 250), eat(1, '2026-09-18', 250), eat(1, today, 250)]
    expect(usualFoods(entries, 'breakfast', today, foods)).toEqual([])
  })

  it('ignores days older than four weeks and deleted foods', () => {
    const entries = [eat(1, '2026-08-01', 250), eat(1, '2026-09-18', 250), eat(9, '2026-09-17', 10), eat(9, '2026-09-18', 10)]
    expect(usualFoods(entries, 'breakfast', today, foods)).toEqual([])
  })

  it('does not count the same day twice', () => {
    const entries = [eat(3, '2026-09-18', 100), eat(3, '2026-09-18', 100)]
    expect(usualFoods(entries, 'breakfast', today, foods)).toEqual([])
  })
})
