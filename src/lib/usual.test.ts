import { describe, expect, it } from 'vitest'
import type { Entry, Food, Meal } from '../db'
import { usualFoods } from './usual'

const food = (id: string, name: string): Food => ({ id, name, servings: [], kcal: 100, carbs: 10, protein: 5, fat: 2 })
const foods = new Map([food('f1', 'Leche entera'), food('f2', 'Pan blanco'), food('f3', 'Café'), food('f4', 'Manzana')].map((f) => [f.id, f]))

let id = 0
const eat = (foodId: string, date: string, grams: number, meal: Meal = 'breakfast'): Entry => ({
  id: String(++id),
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
      eat('f1', '2026-09-10', 250),
      eat('f1', '2026-09-12', 250),
      eat('f1', '2026-09-15', 250),
      eat('f2', '2026-09-14', 60),
      eat('f2', '2026-09-18', 80),
      eat('f3', '2026-09-18', 100), // only once
      eat('f4', '2026-09-17', 150, 'snack'),
      eat('f4', '2026-09-18', 150, 'snack'), // another meal
    ]
    const usual = usualFoods(entries, 'breakfast', today, foods)
    expect(usual.map((u) => [u.food.name, u.days])).toEqual([
      ['Leche entera', 3],
      ['Pan blanco', 2],
    ])
  })

  it('suggests the amount used the last time', () => {
    const entries = [eat('f2', '2026-09-18', 80), eat('f2', '2026-09-14', 60)]
    expect(usualFoods(entries, 'breakfast', today, foods)[0].amount).toEqual({ quantity: 80 })
  })

  it('leaves out what is already in the meal today', () => {
    const entries = [eat('f1', '2026-09-17', 250), eat('f1', '2026-09-18', 250), eat('f1', today, 250)]
    expect(usualFoods(entries, 'breakfast', today, foods)).toEqual([])
  })

  it('ignores days older than four weeks and deleted foods', () => {
    const entries = [eat('f1', '2026-08-01', 250), eat('f1', '2026-09-18', 250), eat('f9', '2026-09-17', 10), eat('f9', '2026-09-18', 10)]
    expect(usualFoods(entries, 'breakfast', today, foods)).toEqual([])
  })

  it('does not count the same day twice', () => {
    const entries = [eat('f3', '2026-09-18', 100), eat('f3', '2026-09-18', 100)]
    expect(usualFoods(entries, 'breakfast', today, foods)).toEqual([])
  })
})
