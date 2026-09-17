import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '../lib/categories'
import { kcalLooksWrong } from '../lib/nutrition'
import seedFoods from './seedFoods.json'

describe('built-in food list', () => {
  it('has consistent calories for every food', () => {
    expect(seedFoods.filter(kcalLooksWrong).map((f) => f.name)).toEqual([])
  })

  it('uses known categories and unique names', () => {
    expect(seedFoods.filter((f) => !(CATEGORIES as readonly string[]).includes(f.category)).map((f) => f.name)).toEqual([])
    const names = seedFoods.map((f) => f.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('has sensible servings', () => {
    const bad = seedFoods.flatMap((f) => f.servings.filter((s) => !(s.grams > 0) || !s.label.trim()).map(() => f.name))
    expect(bad).toEqual([])
  })
})
