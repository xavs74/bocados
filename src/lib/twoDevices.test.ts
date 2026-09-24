import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BocadosDB, attachHooks, type BocadosDB as Db } from '../db'
// @ts-expect-error the Worker is plain JavaScript, on purpose.
import { fakeD1 } from '../../worker/fakeD1.js'
// @ts-expect-error same.
import { checkItems, pull, push } from '../../worker/sync.js'
import { localCounts, syncOnce, type Send } from './sync'

/**
 * Two devices, one account, the same server code the Worker runs.
 *
 * This is the test the sync proposal ended with and we had not done: a phone
 * and a laptop deliberately made to disagree — edits on both while offline, a
 * deletion on one side, the same food added on both — to see what each is left
 * holding once they have caught up.
 */

const settle = () => new Promise((r) => setTimeout(r, 20))

/** One account's server, shared by the devices. */
function account(user = 'u-1') {
  let offline = new Set<string>()
  const d1 = fakeD1()

  const sendAs = (device: string): Send => async ({ since, items }) => {
    if (offline.has(device)) throw new Error('sin conexión')
    const checked = checkItems(items)
    if (checked.error) throw new Error(checked.error)
    await push(d1, user, checked.items)
    return (await pull(d1, user, since)) as never
  }

  return {
    sendAs,
    cut: (device: string) => offline.add(device),
    restore: (device: string) => offline.delete(device),
    reset: () => (offline = new Set()),
  }
}

/** A device: its own database, with the same hooks the app installs. */
async function device(name: string): Promise<Db> {
  const db = new BocadosDB(`bocados-${name}-${crypto.randomUUID()}`, { seed: false })
  attachHooks(db)
  await db.open()
  return db
}

const food = (name: string) => ({ name, servings: [], kcal: 100, carbs: 1, protein: 1, fat: 1 })
const entry = (date: string, name: string, grams: number) => ({
  date,
  meal: 'lunch' as const,
  foodId: 'f1',
  name,
  per100: { kcal: 100, carbs: 1, protein: 1, fat: 1 },
  grams,
  amount: { quantity: grams },
  createdAt: Date.now(),
})

describe('a phone and a laptop on one account', () => {
  let server: ReturnType<typeof account>
  let phone: Db
  let laptop: Db

  beforeEach(async () => {
    server = account()
    phone = await device('movil')
    laptop = await device('portatil')
  })

  const syncPhone = () => syncOnce(server.sendAs('movil'), phone)
  const syncLaptop = () => syncOnce(server.sendAs('portatil'), laptop)

  it('carries what one logs to the other', async () => {
    await phone.entries.add(entry('2026-09-24', 'Pan blanco', 80) as never)
    await settle()
    await syncPhone()
    await syncLaptop()

    expect((await laptop.entries.toArray()).map((e) => e.name)).toEqual(['Pan blanco'])
  })

  it('keeps both when each logs its own day', async () => {
    await phone.entries.add(entry('2026-09-24', 'Pan blanco', 80) as never)
    await laptop.entries.add(entry('2026-09-25', 'Merluza', 200) as never)
    await settle()

    // Each sends, then each catches up.
    await syncPhone()
    await syncLaptop()
    await syncPhone()

    expect((await localCounts(phone)).rows).toBe(2)
    expect((await localCounts(laptop)).rows).toBe(2)
  })

  it('gives the same answer to both when the same row is edited on each', async () => {
    const id = await phone.foods.add(food('Pan') as never)
    await settle()
    await syncPhone()
    await syncLaptop()

    // Both go offline and rename it differently; the laptop's edit is later,
    // stamped by the database itself as it would be in the app.
    server.cut('movil')
    server.cut('portatil')
    await phone.foods.update(id, { name: 'Pan de molde' })
    await settle()
    await laptop.foods.update(id, { name: 'Pan integral' })
    await settle()

    server.reset()
    await syncPhone()
    await syncLaptop()
    await syncPhone()

    expect((await phone.foods.get(id))?.name).toBe('Pan integral')
    expect((await laptop.foods.get(id))?.name).toBe('Pan integral')
  })

  it('does not bring back a day deleted on the other device', async () => {
    const id = await phone.entries.add(entry('2026-09-24', 'Pan blanco', 80) as never)
    await settle()
    await syncPhone()
    await syncLaptop()
    expect(await laptop.entries.count()).toBe(1)

    await phone.entries.delete(id)
    await settle()
    await syncPhone()
    await syncLaptop()

    expect(await laptop.entries.count()).toBe(0)
    // And it stays gone after another round, rather than coming back.
    await syncPhone()
    await syncLaptop()
    expect(await phone.entries.count()).toBe(0)
    expect(await laptop.entries.count()).toBe(0)
  })

  it('keeps an edit made after a deletion elsewhere, since it is the later word', async () => {
    const id = await phone.foods.add(food('Pan') as never)
    await settle()
    await syncPhone()
    await syncLaptop()

    server.cut('portatil')
    await phone.foods.delete(id)
    await settle()
    await syncPhone()

    // The laptop was offline and edited it afterwards.
    await laptop.foods.update(id, { name: 'Pan integral', updatedAt: Date.now() + 1000 })
    await settle()
    server.restore('portatil')
    await syncLaptop()
    await syncPhone()

    expect((await phone.foods.get(id))?.name).toBe('Pan integral')
  })

  it('ends up with two foods when both add their own "Pan blanco"', async () => {
    await phone.foods.add(food('Pan blanco') as never)
    await laptop.foods.add(food('Pan blanco') as never)
    await settle()

    await syncPhone()
    await syncLaptop()
    await syncPhone()

    // Nothing is lost; the duplicate is visible and can be deleted by hand.
    expect(await phone.foods.count()).toBe(2)
    expect(await laptop.foods.count()).toBe(2)
  })

  it('catches up after a week offline, without losing what was written meanwhile', async () => {
    await phone.entries.add(entry('2026-09-20', 'Uno', 80) as never)
    await settle()
    await syncPhone()

    server.cut('movil')
    for (const [date, name] of [
      ['2026-09-21', 'Dos'],
      ['2026-09-22', 'Tres'],
    ] as const) {
      await phone.entries.add(entry(date, name, 80) as never)
    }
    await laptop.entries.add(entry('2026-09-23', 'Cuatro', 80) as never)
    await settle()
    await syncLaptop()
    await expect(syncPhone()).rejects.toThrow('sin conexión')

    server.restore('movil')
    await syncPhone()
    await syncLaptop()

    const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort()
    expect(names(await phone.entries.toArray())).toEqual(['Cuatro', 'Dos', 'Tres', 'Uno'])
    expect(names(await laptop.entries.toArray())).toEqual(['Cuatro', 'Dos', 'Tres', 'Uno'])
  })

  it('settles: once both are quiet, nothing keeps bouncing between them', async () => {
    await phone.foods.add(food('Pan blanco') as never)
    await laptop.weights.put({ date: '2026-09-24', kg: 78.4, createdAt: 1 } as never)
    await settle()

    await syncPhone()
    await syncLaptop()
    await syncPhone()

    const quiet = await syncLaptop()
    expect(quiet.sent).toBe(0)
    expect(quiet.received).toBe(0)
    expect((await syncPhone()).sent).toBe(0)
  })

  it('agrees on the goal when both change it, without either being left behind', async () => {
    await phone.settings.put({ key: 'goals', value: { kcal: 2200 } } as never)
    await settle()
    await laptop.settings.put({ key: 'goals', value: { kcal: 1900 } } as never)
    await settle()

    await syncPhone()
    await syncLaptop()
    await syncPhone()

    expect((await phone.settings.get('goals'))?.value).toEqual({ kcal: 1900 })
    expect((await laptop.settings.get('goals'))?.value).toEqual({ kcal: 1900 })
  })
})
