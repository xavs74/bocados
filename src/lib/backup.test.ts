import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, withoutTombstones } from '../db'
import { collectBackup, restoreBackup } from './backup'

// Dexie writes the generated id back into the object it is given, so each
// insert gets its own.
const food = (name = 'Pan de prueba') => ({ name, servings: [], kcal: 267, carbs: 49, protein: 9, fat: 3 })
const entry = () => ({
  date: '2026-09-20',
  meal: 'lunch' as const,
  foodId: 1,
  name: 'Pan de prueba',
  per100: { kcal: 267, carbs: 49, protein: 9, fat: 3 },
  grams: 80,
  amount: { quantity: 80 },
  createdAt: 1,
})

async function fill() {
  await db.foods.add(food() as never)
  await db.entries.add(entry() as never)
  await db.mealSets.add({ name: 'Desayuno de siempre', items: [], lastUsed: 1, createdAt: 1 } as never)
  await db.recipes.add({ name: 'Lentejas', servings: 4, ingredients: [], createdAt: 1 } as never)
  await db.planned.add({ ...entry(), date: '2026-09-25' } as never)
  await db.weights.add({ date: '2026-09-20', kg: 78.4, createdAt: 1 })
  await db.settings.put({ key: 'goals', value: { kcal: 2200, split: { carbs: 45, protein: 25, fat: 30 }, set: true } })
  await db.tombstones.put({ id: 'foods:borrado', table: 'foods', uid: 'borrado', deletedAt: 1 })
  await db.snapshots.put({ id: 'antes-de-los-identificadores', at: '2026-09-23T00:00:00.000Z', tables: {} })
}

/** What a copy is expected to carry: everything except what SKIP leaves out. */
const carried = () => db.tables.filter((t) => !['snapshots', 'migration'].includes(t.name))

const counts = async () => Object.fromEntries(await Promise.all(carried().map(async (t) => [t.name, await t.count()] as const)))

describe('backup', () => {
  beforeEach(async () => {
    await db.open()
    // Emptying the tables would otherwise count as deleting every row in them.
    await withoutTombstones(() => Promise.all(db.tables.map((t) => t.clear())))
  })

  it('carries every table, so none can be forgotten', async () => {
    await fill()
    const copy = await collectBackup()
    for (const table of carried()) expect(copy[table.name], table.name).toHaveLength(1)
  })

  it('leaves the pre-migration snapshot out, which would only double its size', async () => {
    await fill()
    expect(await collectBackup()).not.toHaveProperty('snapshots')
    // ...and a restore leaves the device's own snapshot alone.
    await restoreBackup(await collectBackup())
    expect(await db.snapshots.count()).toBe(1)
  })

  it('brings everything back exactly as it was', async () => {
    await fill()
    const before = await collectBackup()
    const had = await counts()

    await withoutTombstones(() => Promise.all(db.tables.map((t) => t.clear())))
    expect(await db.entries.count()).toBe(0)

    const restored = await restoreBackup(before)
    expect(restored).toEqual({ foods: 1, entries: 1 })
    expect(await counts()).toEqual(had)
    // updatedAt is stamped by the database itself on every write.
    expect(await db.weights.get('2026-09-20')).toEqual({ date: '2026-09-20', kg: 78.4, createdAt: 1, updatedAt: expect.any(Number) })
    // The whole copy matches again, apart from when it was taken.
    const after = await collectBackup()
    for (const table of carried()) expect(after[table.name], table.name).toEqual(before[table.name])
  })

  it('replaces what was there rather than merging', async () => {
    await fill()
    const copy = await collectBackup()
    await db.foods.add(food('Alimento de otro móvil') as never)
    await restoreBackup(copy)
    expect((await db.foods.toArray()).map((f) => f.name)).toEqual(['Pan de prueba'])
  })

  it('restores a backup made before a table existed', async () => {
    await fill()
    const old = await collectBackup()
    delete old.weights
    await restoreBackup(old)
    expect(await db.weights.count()).toBe(0)
    expect(await db.foods.count()).toBe(1)
  })

  it('refuses a file that is not a Bocados backup', async () => {
    await expect(restoreBackup({ format: 'otra-cosa', foods: [], entries: [], settings: [] })).rejects.toThrow('no es una copia')
    await expect(restoreBackup({ format: 'bocados-backup', foods: [] })).rejects.toThrow('no es una copia')
  })
})
