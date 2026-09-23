import { beforeEach, describe, expect, it } from 'vitest'
import { fakeD1 } from './fakeD1.js'
import { LIMITS, checkItems, forgetUser, pull, push } from './sync.js'

const XAVI = 'u-xavi'
const MADRE = 'u-madre'

const change = (uid, updatedAt, data = { name: 'Pan blanco' }, kind = 'food') => ({ kind, uid, updatedAt, data })
const send = async (db, user, items, now) => {
  const checked = checkItems(items, now)
  expect(checked.error).toBeUndefined()
  await push(db, user, checked.items)
}

describe('sending and receiving', () => {
  let db
  beforeEach(() => {
    db = fakeD1()
  })

  it('gives a device everything it has not seen', async () => {
    await send(db, XAVI, [change('f1', 1000), change('e1', 1001, { grams: 80 }, 'entry')])

    // The other phone has seen nothing yet.
    const first = await pull(db, XAVI, 0)
    expect(first.items.map((i) => i.uid)).toEqual(['f1', 'e1'])
    expect(first.items[0]).toEqual({ kind: 'food', uid: 'f1', updatedAt: 1000, deleted: false, data: { name: 'Pan blanco' } })
    expect(first.more).toBe(false)

    // Asking again with the count it reached brings nothing new.
    expect((await pull(db, XAVI, first.cursor)).items).toEqual([])
  })

  it('keeps one account away from another', async () => {
    await send(db, XAVI, [change('f1', 1000)])
    await send(db, MADRE, [change('f2', 1000, { name: 'Merluza' })])

    expect((await pull(db, XAVI, 0)).items.map((i) => i.uid)).toEqual(['f1'])
    expect((await pull(db, MADRE, 0)).items.map((i) => i.uid)).toEqual(['f2'])
  })

  it('counts each account on its own, so one does not skip rows of the other', async () => {
    await send(db, XAVI, [change('f1', 1000)])
    await send(db, MADRE, [change('f2', 1000)])
    await send(db, XAVI, [change('f3', 1001)])

    const mine = await pull(db, XAVI, 0)
    expect(mine.items.map((i) => i.uid)).toEqual(['f1', 'f3'])
    expect((await pull(db, MADRE, 0)).items.map((i) => i.uid)).toEqual(['f2'])
  })
})

describe('when two devices change the same row', () => {
  let db
  beforeEach(() => {
    db = fakeD1()
  })

  it('keeps the later change', async () => {
    await send(db, XAVI, [change('f1', 1000, { name: 'Pan' })])
    await send(db, XAVI, [change('f1', 2000, { name: 'Pan integral' })])

    const { items } = await pull(db, XAVI, 0)
    expect(items).toHaveLength(1)
    expect(items[0].data).toEqual({ name: 'Pan integral' })
  })

  it('drops an older one, so a phone that was offline cannot undo newer edits', async () => {
    await send(db, XAVI, [change('f1', 2000, { name: 'Pan integral' })])
    await send(db, XAVI, [change('f1', 1000, { name: 'Pan' })])

    const { items } = await pull(db, XAVI, 0)
    expect(items[0].data).toEqual({ name: 'Pan integral' })
  })

  it('leaves a tie alone, so both devices land on the same answer', async () => {
    await send(db, XAVI, [change('f1', 1000, { name: 'Primero' })])
    await send(db, XAVI, [change('f1', 1000, { name: 'Segundo' })])

    expect((await pull(db, XAVI, 0)).items[0].data).toEqual({ name: 'Primero' })
  })

  it('carries a deletion, and it beats an older edit', async () => {
    await send(db, XAVI, [change('f1', 1000)])
    await send(db, XAVI, [{ kind: 'food', uid: 'f1', updatedAt: 2000, deleted: true }])

    const { items } = await pull(db, XAVI, 0)
    expect(items[0]).toEqual({ kind: 'food', uid: 'f1', updatedAt: 2000, deleted: true })
    expect(items[0].data).toBeUndefined()
  })

  it('lets a row come back if it is written again later', async () => {
    await send(db, XAVI, [{ kind: 'food', uid: 'f1', updatedAt: 1000, deleted: true }])
    await send(db, XAVI, [change('f1', 2000, { name: 'Otra vez' })])

    const { items } = await pull(db, XAVI, 0)
    expect(items[0].deleted).toBe(false)
    expect(items[0].data).toEqual({ name: 'Otra vez' })
  })

  it('moves a changed row to the end of the queue, so others notice it', async () => {
    await send(db, XAVI, [change('f1', 1000), change('f2', 1000, { name: 'Leche' })])
    const seen = await pull(db, XAVI, 0)

    await send(db, XAVI, [change('f1', 3000, { name: 'Pan integral' })])
    const after = await pull(db, XAVI, seen.cursor)
    expect(after.items.map((i) => i.uid)).toEqual(['f1'])
  })
})

describe('what it refuses', () => {
  it('only knows its own kinds of row', () => {
    expect(checkItems([change('f1', 1)]).error).toBeUndefined()
    expect(checkItems([{ kind: 'usuarios', uid: 'x', updatedAt: 1 }]).error).toMatch(/Tipo desconocido/)
  })

  it('wants an identifier and a time', () => {
    expect(checkItems([{ kind: 'food', uid: '', updatedAt: 1 }]).error).toMatch(/Identificador/)
    expect(checkItems([{ kind: 'food', uid: 'f1', updatedAt: 'ayer' }]).error).toMatch(/Fecha/)
  })

  it('refuses more than it should take at once', () => {
    const many = Array.from({ length: LIMITS.batch + 1 }, (_, i) => change(`f${i}`, 1))
    expect(checkItems(many).error).toMatch(/Demasiados/)
  })

  it('refuses one row that is far too big', () => {
    expect(checkItems([change('f1', 1, { note: 'x'.repeat(LIMITS.item) })]).error).toMatch(/demasiado grande/)
  })

  it('pulls a clock that runs ahead back to now', () => {
    const now = 1_000_000
    const { items } = checkItems([change('f1', now + 24 * 60 * 60 * 1000)], now)
    expect(items[0].updatedAt).toBe(now + LIMITS.futureMs)
  })
})

describe('a first upload, which arrives in pieces', () => {
  it('hands it back a page at a time', async () => {
    const db = fakeD1()
    // Two batches of 400: more than one page of 500 comes back.
    for (const batch of [0, 1]) {
      await send(
        db,
        XAVI,
        Array.from({ length: 400 }, (_, i) => change(`f${batch}-${i}`, 1000 + i)),
      )
    }

    const first = await pull(db, XAVI, 0)
    expect(first.items).toHaveLength(LIMITS.page)
    expect(first.more).toBe(true)

    const second = await pull(db, XAVI, first.cursor)
    expect(second.items).toHaveLength(800 - LIMITS.page)
    expect(second.more).toBe(false)

    // Nothing was handed out twice or missed.
    const uids = [...first.items, ...second.items].map((i) => i.uid)
    expect(new Set(uids).size).toBe(800)
  })
})

describe('forgetUser', () => {
  it('leaves nothing of that account behind', async () => {
    const db = fakeD1()
    await send(db, XAVI, [change('f1', 1000)])
    await send(db, MADRE, [change('f2', 1000)])

    await forgetUser(db, XAVI)

    expect((await pull(db, XAVI, 0)).items).toEqual([])
    expect((await pull(db, MADRE, 0)).items.map((i) => i.uid)).toEqual(['f2'])
    // The count starts again, so a device that comes back gets everything.
    await send(db, XAVI, [change('f9', 3000)])
    expect((await pull(db, XAVI, 0)).items.map((i) => i.uid)).toEqual(['f9'])
  })
})
