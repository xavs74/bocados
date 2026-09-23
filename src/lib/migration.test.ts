import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { BocadosDB, type Entry, type Food, type MealSet, type Planned, type Recipe, type Snapshot } from '../db'

/**
 * The database exactly as version 7 left it: every table keyed by a number the
 * device counted out, and every reference pointing at one of those numbers.
 */
async function oldDatabase(name: string) {
  const old = new Dexie(name)
  old.version(7).stores({
    foods: '++id, name, lastUsed, barcode',
    entries: '++id, date, foodId',
    settings: 'key',
    mealSets: '++id, name, lastUsed',
    recipes: '++id, name',
    planned: '++id, date',
    weights: 'date',
  })
  await old.open()

  // Ids are handed out in order: pan 1, pollo 2, arroz 3, and the recipe's food 4.
  const add = async (table: string, row: object) => Number(await old.table(table).add(row))

  const pan = await add('foods', { name: 'Pan blanco', servings: [], kcal: 267, carbs: 49, protein: 9, fat: 3 })
  const pollo = await add('foods', { name: 'Pollo', servings: [], kcal: 113, carbs: 0, protein: 22, fat: 3 })
  const arroz = await add('foods', { name: 'Arroz', servings: [], kcal: 350, carbs: 78, protein: 7, fat: 1 })
  const borrado = await add('foods', { name: 'Ya borrado', servings: [], kcal: 100, carbs: 1, protein: 1, fat: 1 })

  const per100 = { kcal: 267, carbs: 49, protein: 9, fat: 3 }
  const item = (foodId: number, name: string, grams: number) => ({ foodId, name, per100, grams, amount: { quantity: grams } })

  await old.table('entries').add({ date: '2026-09-20', meal: 'breakfast', ...item(pan, 'Pan blanco', 80), createdAt: 1 })
  // An entry whose food was deleted long ago: its reference points nowhere.
  await old.table('entries').add({ date: '2026-09-20', meal: 'lunch', ...item(borrado, 'Ya borrado', 50), createdAt: 2 })
  await old.table('planned').add({ date: '2026-09-25', meal: 'dinner', ...item(pollo, 'Pollo', 200), createdAt: 3 })
  await old.table('mealSets').add({ name: 'Desayuno de siempre', items: [item(pan, 'Pan blanco', 80)], createdAt: 4 })

  const recipeFood = await add('foods', { name: 'Arroz con pollo', servings: [{ label: '1 ración', grams: 300 }], kcal: 150, carbs: 20, protein: 10, fat: 3 })
  const recipe = await add('recipes', {
    name: 'Arroz con pollo',
    servings: 4,
    foodId: recipeFood,
    ingredients: [item(arroz, 'Arroz', 400), item(pollo, 'Pollo', 600)],
    createdAt: 5,
  })
  await old.table('foods').update(recipeFood, { recipeId: recipe })

  await old.table('weights').put({ date: '2026-09-20', kg: 78.4, createdAt: 6 })
  await old.table('settings').put({ key: 'goals', value: { kcal: 2200, set: true } })

  await old.table('foods').delete(borrado)
  old.close()
  return { pan, pollo, arroz, recipeFood, recipe }
}

const isNewId = (id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)

describe('the move to identifiers that mean the same everywhere', () => {
  it('keeps every row, gives it a new identifier, and rewrites what points at it', async () => {
    const name = `bocados-prueba-${crypto.randomUUID()}`
    await oldDatabase(name)

    const db = new BocadosDB(name, { seed: false })
    await db.open()

    const foods = (await db.table('foods').toArray()) as Food[]
    const entries = (await db.table('entries').toArray()) as Entry[]
    const planned = (await db.table('planned').toArray()) as Planned[]
    const sets = (await db.table('mealSets').toArray()) as MealSet[]
    const recipes = (await db.table('recipes').toArray()) as Recipe[]

    // Nothing lost: four foods (one was deleted before the migration), two
    // entries, one of each of the rest.
    expect(foods).toHaveLength(4)
    expect(entries).toHaveLength(2)
    expect(planned).toHaveLength(1)
    expect(sets).toHaveLength(1)
    expect(recipes).toHaveLength(1)
    expect(await db.table('weights').count()).toBe(1)

    for (const row of [...foods, ...entries, ...planned, ...sets, ...recipes]) expect(isNewId(row.id), JSON.stringify(row).slice(0, 60)).toBe(true)

    // Every reference lands on the right row, by name.
    const byId = new Map(foods.map((f) => [f.id, f]))
    const pan = entries.find((e) => e.name === 'Pan blanco')!
    expect(byId.get(pan.foodId)?.name).toBe('Pan blanco')
    expect(byId.get(planned[0].foodId)?.name).toBe('Pollo')
    expect(byId.get(sets[0].items[0].foodId)?.name).toBe('Pan blanco')
    expect(recipes[0].ingredients.map((i) => byId.get(i.foodId)?.name)).toEqual(['Arroz', 'Pollo'])

    // The recipe and the food that mirrors it still point at each other.
    const mirror = foods.find((f) => f.name === 'Arroz con pollo')!
    expect(recipes[0].foodId).toBe(mirror.id)
    expect(mirror.recipeId).toBe(recipes[0].id)

    // The entry whose food was already gone stays dangling, as it was, rather
    // than being pointed at somebody else's food.
    const orphan = entries.find((e) => e.name === 'Ya borrado')!
    expect(byId.has(orphan.foodId)).toBe(false)
    expect(orphan.foodId).toMatch(/^borrado-/)

    // Everything now says when it last changed.
    for (const row of [...foods, ...entries, ...planned, ...sets, ...recipes]) expect(typeof row.updatedAt).toBe('number')
    expect(typeof (await db.table('weights').get('2026-09-20'))?.updatedAt).toBe('number')
    expect(typeof (await db.table('settings').get('goals'))?.updatedAt).toBe('number')

    db.close()
  })

  it('keeps a copy of what everything looked like before', async () => {
    const name = `bocados-prueba-${crypto.randomUUID()}`
    await oldDatabase(name)

    const db = new BocadosDB(name, { seed: false })
    await db.open()
    const snapshot = (await db.table('snapshots').get('antes-de-los-identificadores')) as Snapshot

    expect(snapshot.tables.foods).toHaveLength(4)
    expect(snapshot.tables.entries).toHaveLength(2)
    // The copy holds the old numbers, which is the point of keeping it.
    expect(typeof (snapshot.tables.foods[0] as Food).id).toBe('number')
    // The staging table used along the way is gone.
    expect(db.tables.map((t) => t.name)).not.toContain('migration')

    db.close()
  })

  it('runs on an empty database too', async () => {
    const name = `bocados-prueba-${crypto.randomUUID()}`
    const db = new BocadosDB(name, { seed: false })
    await db.open()
    expect(await db.table('foods').count()).toBe(0)
    expect(await db.table('tombstones').count()).toBe(0)
    db.close()
  })
})
