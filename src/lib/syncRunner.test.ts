// @vitest-environment happy-dom
// The runner listens for the app coming back in front, which needs a document.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, withoutTombstones } from '../db'
import { saveSyncState } from './sync'
import { enableSync, getSyncStatus, sendThrough, startSync, stopSync, syncNow } from './syncRunner'

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const food = (name: string) => ({ name, servings: [], kcal: 100, carbs: 1, protein: 1, fat: 1 })

/** Counts the rounds, and can be told to fail. */
function transport() {
  const calls: { since: number; items: number }[] = []
  let fail: string | null = null
  return {
    calls,
    breakIt: (why: string | null) => {
      fail = why
    },
    send: async ({ since, items }: { since: number; items: unknown[] }) => {
      calls.push({ since, items: items.length })
      if (fail) throw new Error(fail)
      return { cursor: since, more: false, items: [] }
    },
  }
}

describe('when syncing happens', () => {
  let net: ReturnType<typeof transport>

  beforeEach(async () => {
    await db.open()
    await settle()
    await withoutTombstones(() => Promise.all(db.tables.map((t) => t.clear())))
    await db.sync.clear()
    net = transport()
    sendThrough(net.send as never)
  })

  afterEach(() => stopSync())

  it('does nothing until this device has been told to sync', async () => {
    await startSync()
    await db.foods.add(food('Pan blanco') as never)
    await settle(60)

    expect(net.calls).toEqual([])
    expect(getSyncStatus()).toEqual({ state: 'off' })
  })

  it('syncs once when it starts, once told', async () => {
    await saveSyncState({ enabled: true })
    await startSync()
    await settle()

    expect(net.calls).toHaveLength(1)
    expect(getSyncStatus().state).toBe('idle')
  })

  it('follows a change here, a moment later', async () => {
    await enableSync(true)
    await settle()
    const before = net.calls.length

    await db.foods.add(food('Pan blanco') as never)
    // It waits a few seconds rather than syncing on every keystroke.
    await settle(60)
    expect(net.calls).toHaveLength(before)
  })

  it('does not let two rounds overlap', async () => {
    await saveSyncState({ enabled: true })
    await Promise.all([syncNow(), syncNow(), syncNow()])
    expect(net.calls).toHaveLength(1)
  })

  it('says it is waiting when there is no connection, rather than failing loudly', async () => {
    await saveSyncState({ enabled: true })
    net.breakIt('sin conexión')
    await syncNow()

    const status = getSyncStatus()
    expect(status.state).toBe('waiting')
    if (status.state === 'waiting') expect(status.error).toBe('sin conexión')
  })

  it('picks up again once the connection is back', async () => {
    await saveSyncState({ enabled: true })
    net.breakIt('sin conexión')
    await syncNow()
    net.breakIt(null)
    await syncNow()

    expect(getSyncStatus().state).toBe('idle')
  })

  it('stops for good when it is turned off', async () => {
    await enableSync(true)
    await settle()
    await enableSync(false)
    const before = net.calls.length

    await db.foods.add(food('Pan blanco') as never)
    await settle(60)
    expect(net.calls).toHaveLength(before)
    expect(getSyncStatus()).toEqual({ state: 'off' })
  })

  it('catches up when the app comes back in front', async () => {
    await enableSync(true)
    await settle()
    const before = net.calls.length

    // A phone does not reload when it is brought back from the background.
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(net.calls.length).toBeGreaterThan(before)
  })

  it('catches up when the connection comes back', async () => {
    await enableSync(true)
    await settle()
    const before = net.calls.length

    window.dispatchEvent(new Event('online'))
    await settle()

    expect(net.calls.length).toBeGreaterThan(before)
  })

  it('listens no more once it is turned off', async () => {
    await enableSync(true)
    await settle()
    await enableSync(false)
    const before = net.calls.length

    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    await settle()

    expect(net.calls).toHaveLength(before)
  })
})
