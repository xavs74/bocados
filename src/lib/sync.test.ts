import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, withoutTombstones } from '../db'
// The real server, so what the app sends is what the Worker actually stores.
// @ts-expect-error the Worker is plain JavaScript, on purpose.
import { fakeD1 } from '../../worker/fakeD1.js'
// @ts-expect-error same.
import { checkItems, pull, push } from '../../worker/sync.js'
import { applyRemote, clearLocal, localChanges, localCounts, saveSyncState, syncOnce, syncState, type Change, type Send } from './sync'

const settle = () => new Promise((r) => setTimeout(r, 20))

/** A device talking to the Worker's own code, over a database in memory. */
function server(user = 'u-1') {
  const d1 = fakeD1()
  const send: Send = async ({ since, items }) => {
    const checked = checkItems(items)
    if (checked.error) throw new Error(checked.error)
    await push(d1, user, checked.items)
    return (await pull(d1, user, since)) as never
  }
  return { send, d1 }
}

const food = (name: string) => ({ name, servings: [], kcal: 100, carbs: 1, protein: 1, fat: 1 })

describe('what this device has to send', () => {
  beforeEach(async () => {
    await db.open()
    await settle()
    await withoutTombstones(() => Promise.all(db.tables.map((t) => t.clear())))
  })

  it('sends rows written since the last time, and nothing older', async () => {
    await db.foods.add(food('Pan blanco') as never)
    const after = Date.now() + 1
    await settle()
    expect((await localChanges(0)).map((c) => c.kind)).toEqual(['food'])
    expect(await localChanges(after)).toEqual([])
  })

  it('sends a deletion as a row with nothing in it', async () => {
    const id = await db.foods.add(food('Pan blanco') as never)
    await db.foods.delete(id)
    await settle()
    const deletion = (await localChanges(0)).find((c) => c.deleted)
    expect(deletion).toMatchObject({ kind: 'food', uid: id, deleted: true })
  })

  it('keeps this device to itself', async () => {
    await db.settings.put({ key: 'goals', value: { kcal: 2200 } })
    await db.settings.put({ key: 'onboardingSkipped', value: true })
    await settle()
    expect((await localChanges(0)).map((c) => c.uid)).toEqual(['goals'])
  })
})

describe('what comes back from the account', () => {
  beforeEach(async () => {
    await db.open()
    await settle()
    await withoutTombstones(() => Promise.all(db.tables.map((t) => t.clear())))
  })

  it('writes a row this device had never seen', async () => {
    await applyRemote([{ kind: 'food', uid: 'f1', updatedAt: 1000, data: { name: 'Merluza', servings: [], kcal: 90, carbs: 0, protein: 18, fat: 2 } }])
    expect((await db.foods.get('f1'))?.name).toBe('Merluza')
  })

  it('does not undo a newer change made here', async () => {
    await db.foods.put({ id: 'f1', ...food('Pan integral'), updatedAt: 5000 } as never)
    await applyRemote([{ kind: 'food', uid: 'f1', updatedAt: 1000, data: { name: 'Pan blanco' } }])
    expect((await db.foods.get('f1'))?.name).toBe('Pan integral')
  })

  it('deletes here what was deleted elsewhere', async () => {
    await db.foods.put({ id: 'f1', ...food('Pan'), updatedAt: 1000 } as never)
    await applyRemote([{ kind: 'food', uid: 'f1', updatedAt: 2000, deleted: true }])
    expect(await db.foods.get('f1')).toBeUndefined()
  })

  it('leaves no trace that would bounce back on the next sync', async () => {
    await applyRemote([{ kind: 'food', uid: 'f1', updatedAt: 1000, data: { name: 'Merluza' } }])
    await applyRemote([{ kind: 'food', uid: 'f1', updatedAt: 2000, deleted: true }])
    await settle()
    // Neither the write nor the delete counts as something this device did.
    expect(await db.tombstones.count()).toBe(0)
    expect(await localChanges(999)).toEqual([])
  })
})

describe('a round with the real server', () => {
  beforeEach(async () => {
    await db.open()
    await settle()
    await withoutTombstones(() => Promise.all(db.tables.map((t) => t.clear())))
    await db.sync.clear()
  })

  it('uploads what is here, and brings it all back after the phone is wiped', async () => {
    const { send } = server()
    await db.foods.add(food('Pan blanco') as never)
    await db.weights.put({ date: '2026-09-20', kg: 78.4, createdAt: 1 } as never)
    await db.settings.put({ key: 'goals', value: { kcal: 2200 } })
    await settle()

    const first = await syncOnce(send)
    expect(first.sent).toBe(3)
    expect((await syncState()).cursor).toBeGreaterThan(0)

    // The phone is lost: a new one signs in with nothing on it.
    await clearLocal()
    expect(await db.foods.count()).toBe(0)

    const second = await syncOnce(send)
    expect(second.received).toBe(3)
    expect((await db.foods.toArray())[0].name).toBe('Pan blanco')
    expect((await db.weights.get('2026-09-20'))?.kg).toBe(78.4)
    expect((await db.settings.get('goals'))?.value).toEqual({ kcal: 2200 })
  })

  it('sends nothing twice, and settles', async () => {
    const { send } = server()
    await db.foods.add(food('Pan blanco') as never)
    await settle()

    await syncOnce(send)
    const again = await syncOnce(send)
    expect(again.sent).toBe(0)
    expect(again.received).toBe(0)
  })

  it('carries a deletion to the account', async () => {
    const { send, d1 } = server()
    const id = await db.foods.add(food('Pan blanco') as never)
    await settle()
    await syncOnce(send)

    await db.foods.delete(id)
    await settle()
    await syncOnce(send)

    const stored = await pull(d1, 'u-1', 0)
    expect(stored.items.find((i: Change) => i.uid === id)?.deleted).toBe(true)
  })

  it('sends a first upload in batches the server will take', async () => {
    const { send } = server()
    const rows = Array.from({ length: 1200 }, (_, i) => ({ ...food(`Alimento ${i}`), id: `f${i}`, updatedAt: 1000 + i }))
    await db.foods.bulkPut(rows as never[])
    await settle()

    const result = await syncOnce(send)
    expect(result.sent).toBe(1200)

    await clearLocal()
    await syncOnce(send)
    expect(await db.foods.count()).toBe(1200)
  })

  it('starts again rather than skipping when a round fails', async () => {
    const { send } = server()
    await db.foods.add(food('Pan blanco') as never)
    await settle()

    const broken: Send = async () => {
      throw new Error('sin conexión')
    }
    await expect(syncOnce(broken)).rejects.toThrow('sin conexión')
    // Nothing was written down, so the row is still waiting to be sent.
    expect(await syncState()).toMatchObject({ cursor: 0, pushedAt: 0 })

    expect((await syncOnce(send)).sent).toBe(1)
  })
})

describe('deciding what to do on a first sign-in', () => {
  beforeEach(async () => {
    await db.open()
    await settle()
    await withoutTombstones(() => Promise.all(db.tables.map((t) => t.clear())))
    await db.sync.clear()
  })

  it('counts the days and rows this device holds', async () => {
    const per100 = { kcal: 1, carbs: 0, protein: 0, fat: 0 }
    await db.entries.bulkAdd([
      { date: '2026-09-20', meal: 'lunch', foodId: 'f1', name: 'Uno', per100, grams: 1, amount: { quantity: 1 }, createdAt: 1 },
      { date: '2026-09-20', meal: 'dinner', foodId: 'f1', name: 'Dos', per100, grams: 1, amount: { quantity: 1 }, createdAt: 2 },
      { date: '2026-09-21', meal: 'lunch', foodId: 'f1', name: 'Tres', per100, grams: 1, amount: { quantity: 1 }, createdAt: 3 },
    ] as never[])
    expect(await localCounts()).toEqual({ days: 2, rows: 3 })
  })

  it('empties the device without telling the account to delete anything', async () => {
    await db.foods.add(food('Pan blanco') as never)
    await saveSyncState({ cursor: 42 })
    await clearLocal()
    await settle()

    expect(await db.foods.count()).toBe(0)
    expect(await db.tombstones.count()).toBe(0)
    expect((await syncState()).cursor).toBe(0)
  })

  it('sends everything again if the clock went backwards', async () => {
    const { send } = server()
    await db.foods.add(food('Pan blanco') as never)
    await settle()
    await syncOnce(send)
    expect((await syncOnce(send)).sent).toBe(0)

    // The device's clock jumps back a day: rows written now look older than
    // the last sync, and would otherwise sit there unsent for ever.
    await saveSyncState({ pushedAt: Date.now() + 24 * 60 * 60 * 1000 })
    await db.foods.add(food('Merluza') as never)
    await settle()

    expect((await syncOnce(send)).sent).toBeGreaterThan(0)
  })

  it('does not count a row written in the same millisecond as already sent', async () => {
    const { send } = server()
    await syncOnce(send)

    // The round marks itself done a millisecond before it began, so a row
    // stamped at that very moment — written while it was gathering changes —
    // is still sent next time instead of sitting here for ever.
    const { pushedAt } = await syncState()
    await db.foods.add({ ...food('Escrito a la vez'), updatedAt: pushedAt + 1 } as never)

    expect((await syncOnce(send)).sent).toBe(1)
  })
})
