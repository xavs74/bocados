import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, withoutTombstones } from '../db'
import { collectBackup, restoreBackup } from './backup'

/**
 * A deletion has to leave a mark, or it cannot travel: the row would simply be
 * missing here and present everywhere else, and the next sync would bring it
 * back. These cover the ways the app actually deletes things.
 */
const settle = () => new Promise((r) => setTimeout(r, 20))

const food = (name: string) => ({ name, servings: [], kcal: 100, carbs: 1, protein: 1, fat: 1 }) as never

describe('tombstones', () => {
  beforeEach(async () => {
    await db.open()
    // Marks are written just after a delete commits, so let the last test's
    // land before emptying. Emptying itself would count as deleting every row.
    await settle()
    await withoutTombstones(() => Promise.all(db.tables.map((t) => t.clear())))
  })

  it('marks a row deleted one at a time', async () => {
    const id = await db.foods.add(food('Pan de prueba'))
    await db.foods.delete(id)
    await settle()
    expect(await db.tombstones.toArray()).toEqual([{ id: `foods:${id}`, table: 'foods', uid: id, deletedAt: expect.any(Number) }])
  })

  it('marks every row of a bulk delete', async () => {
    const ids = await Promise.all([db.foods.add(food('Uno')), db.foods.add(food('Dos'))])
    await db.foods.bulkDelete(ids)
    await settle()
    expect((await db.tombstones.toArray()).map((t) => t.uid).sort()).toEqual([...ids].sort())
  })

  it('marks rows deleted through a query, as emptying a week does', async () => {
    const per100 = { kcal: 1, carbs: 0, protein: 0, fat: 0 }
    await db.planned.bulkAdd([
      { date: '2026-09-21', meal: 'lunch', foodId: 'f1', name: 'Uno', per100, grams: 1, amount: { quantity: 1 }, createdAt: 1 },
      { date: '2026-09-21', meal: 'dinner', foodId: 'f1', name: 'Dos', per100, grams: 1, amount: { quantity: 1 }, createdAt: 2 },
    ] as never[])
    await db.planned.where('date').equals('2026-09-21').delete()
    await settle()
    expect(await db.tombstones.count()).toBe(2)
    expect((await db.tombstones.toArray()).every((t) => t.table === 'planned')).toBe(true)
  })

  it('keeps one table from shadowing another', async () => {
    await db.weights.put({ date: '2026-09-21', kg: 78, createdAt: 1 } as never)
    await db.weights.delete('2026-09-21')
    await settle()
    expect((await db.tombstones.toArray())[0].id).toBe('weights:2026-09-21')
  })

  it('leaves no mark when the delete never happened', async () => {
    await db.foods.delete('no-existe')
    await settle()
    expect(await db.tombstones.count()).toBe(0)
  })

  it('does not mark anything when a copy is restored over the top', async () => {
    await db.foods.add(food('Pan de prueba'))
    const copy = await collectBackup()
    await db.foods.add(food('Otro alimento'))
    await restoreBackup(copy)
    await settle()
    expect(await db.tombstones.count()).toBe(0)
    expect(await db.foods.count()).toBe(1)
  })
})
