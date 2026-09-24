import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, withoutTombstones } from '../db'
import { EATING_OUT_CATEGORY } from './categories'
import { DISHES, ESTIMATE, saveDish, searchDishes } from './eatingOut'
import { kcalLooksWrong } from './nutrition'

describe('the dishes themselves', () => {
  it('are all sound: values per 100 g and at least one portion', () => {
    for (const dish of DISHES) {
      expect(dish.name, dish.name).toBeTruthy()
      expect(dish.servings.length, dish.name).toBeGreaterThan(0)
      for (const s of dish.servings) expect(s.grams, `${dish.name} · ${s.label}`).toBeGreaterThan(0)
      // The calories written down should match what is in the dish, counting
      // the alcohol in a beer or a glass of wine.
      expect(kcalLooksWrong(dish), `${dish.name}: ${dish.kcal} kcal vs its macros`).toBe(false)
    }
  })

  it('offers a light, a normal and a big meal, at 400, 700 and 1000 kcal', () => {
    expect(ESTIMATE.servings.map((s) => Math.round((ESTIMATE.kcal * s.grams) / 100))).toEqual([400, 700, 1000])
  })

  it('has no two dishes with the same name', () => {
    expect(new Set(DISHES.map((d) => d.name)).size).toBe(DISHES.length)
  })
})

describe('searchDishes', () => {
  it('finds a dish however it is typed', () => {
    expect(searchDishes('bocadillo tortilla').map((d) => d.name)).toContain('Bocadillo de tortilla')
    expect(searchDishes('PIZZA margarita').map((d) => d.name)).toContain('Pizza margarita')
    expect(searchDishes('cana').map((d) => d.name)).toContain('Caña de cerveza')
  })

  it('waits for something to search for', () => {
    expect(searchDishes('')).toEqual([])
    expect(searchDishes('p')).toEqual([])
  })

  it('keeps the rough estimate out of the results: it has its own buttons', () => {
    expect(searchDishes('comida fuera')).toEqual([])
  })
})

describe('saveDish', () => {
  beforeEach(async () => {
    await db.open()
    await withoutTombstones(() => Promise.all(db.tables.map((t) => t.clear())))
  })

  it('copies the dish into this person food list', async () => {
    const dish = searchDishes('kebab durum')[0]
    const food = await saveDish(dish)
    expect(food.name).toBe(dish.name)
    expect(food.category).toBe(EATING_OUT_CATEGORY)
    expect(food.servings[0].grams).toBe(350)
    expect(await db.foods.count()).toBe(1)
  })

  it('does not copy it twice when the same thing is eaten again', async () => {
    const dish = searchDishes('pizza margarita')[0]
    const first = await saveDish(dish)
    const second = await saveDish(dish)
    expect(second.id).toBe(first.id)
    expect(await db.foods.count()).toBe(1)
  })

  it('carries the alcohol across, so a beer is not taken for a typo', async () => {
    const food = await saveDish(searchDishes('caña')[0])
    expect(food.alcohol).toBeCloseTo(3.9)
    expect(kcalLooksWrong(food)).toBe(false)
  })
})
