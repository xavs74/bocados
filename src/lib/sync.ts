import { SYNCED_TABLES, db, withoutTombstones, type BocadosDB, type SyncState } from '../db'

/**
 * Syncing, from the app's side.
 *
 * The device sends what has changed since it last managed to send anything, and
 * writes back whatever the account has that is newer than the point it had
 * reached. Both halves are safe to repeat: sending the same row twice changes
 * nothing, and a change that arrives twice is applied once.
 *
 * It is off until the person has said what should happen to this device's data
 * (see the account screen), so nothing moves behind anyone's back.
 */

/** What each table is called between devices, and the field its key lives in. */
const KINDS = {
  foods: { kind: 'food', key: 'id' },
  entries: { kind: 'entry', key: 'id' },
  mealSets: { kind: 'mealSet', key: 'id' },
  recipes: { kind: 'recipe', key: 'id' },
  planned: { kind: 'planned', key: 'id' },
  weights: { kind: 'weight', key: 'date' },
  settings: { kind: 'setting', key: 'key' },
} as const satisfies Record<(typeof SYNCED_TABLES)[number], { kind: string; key: string }>

const TABLE_OF = Object.fromEntries(Object.entries(KINDS).map(([table, { kind }]) => [kind, table as keyof typeof KINDS]))

/**
 * Settings that belong to this device rather than to the person: whether the
 * welcome was dismissed here, when a suggestion was put off here, whether the
 * old database was already read. Sending them would make one phone boss the
 * others around.
 */
const LOCAL_SETTINGS = ['onboardingSkipped', 'legacyImported', 'goalSuggestionSnoozedUntil']

/** How many rows go in one request, matching what the server takes. */
export const BATCH = 500

export interface Change {
  kind: string
  uid: string
  updatedAt: number
  deleted?: boolean
  data?: Record<string, unknown>
}

export interface Answer {
  cursor: number
  more: boolean
  items: Change[]
}

export type Send = (body: { since: number; items: Change[] }) => Promise<Answer>

const EMPTY: SyncState = { id: 'state', cursor: 0, pushedAt: 0 }

export async function syncState(database: BocadosDB = db): Promise<SyncState> {
  return (await database.sync.get('state')) ?? EMPTY
}

export async function saveSyncState(changes: Partial<SyncState>, database: BocadosDB = db): Promise<void> {
  await database.sync.put({ ...(await syncState(database)), ...changes, id: 'state' })
}

/** Everything written or deleted on this device since `since`, oldest first. */
export async function localChanges(since: number, database: BocadosDB = db): Promise<Change[]> {
  const changes: Change[] = []

  for (const table of SYNCED_TABLES) {
    const { kind, key } = KINDS[table]
    const rows = (await database.table(table).toArray()) as Record<string, unknown>[]
    for (const row of rows) {
      const updatedAt = (row.updatedAt as number) ?? 0
      if (updatedAt <= since) continue
      const uid = String(row[key])
      if (kind === 'setting' && LOCAL_SETTINGS.includes(uid)) continue
      const { ...data } = row
      changes.push({ kind, uid, updatedAt, data })
    }
  }

  for (const stone of await database.tombstones.where('deletedAt').above(since).toArray()) {
    const table = stone.table as keyof typeof KINDS
    if (!KINDS[table]) continue
    if (KINDS[table].kind === 'setting' && LOCAL_SETTINGS.includes(stone.uid)) continue
    changes.push({ kind: KINDS[table].kind, uid: stone.uid, updatedAt: stone.deletedAt, deleted: true })
  }

  return changes.sort((a, b) => a.updatedAt - b.updatedAt)
}

/**
 * Writes what came from the account. A change older than what is here is
 * dropped, so a row edited on this device while it was offline is not undone by
 * an older copy. Nothing applied here counts as a local change, or it would
 * bounce straight back on the next sync.
 */
export async function applyRemote(items: Change[], database: BocadosDB = db): Promise<number> {
  let applied = 0

  await withoutTombstones(async () => {
    for (const item of items) {
      const table = TABLE_OF[item.kind]
      if (!table) continue
      const { key } = KINDS[table]
      const store = database.table(table)

      const existing = (await store.get(item.uid)) as Record<string, unknown> | undefined
      if (existing && ((existing.updatedAt as number) ?? 0) >= item.updatedAt) continue

      if (item.deleted) {
        if (existing) await store.delete(item.uid)
      } else {
        await store.put({ ...(item.data ?? {}), [key]: item.uid, updatedAt: item.updatedAt })
      }
      applied++
    }
  })

  return applied
}

export interface SyncResult {
  sent: number
  received: number
  cursor: number
}

/**
 * One round: send what this device has, then take what the account has, a page
 * at a time. The point reached is only written down once the work is done, so
 * an interrupted sync starts again rather than skipping what it missed.
 */
export async function syncOnce(send: Send, database: BocadosDB = db): Promise<SyncResult> {
  const state = await syncState(database)

  // Everything in this round is measured against one moment, so a change made
  // while it runs is picked up next time instead of being skipped.
  const startedAt = Date.now()

  /*
   * What has changed is worked out from the clock, so a device whose clock goes
   * backwards would stamp its newer rows earlier than its last sync and never
   * send them again. When that has happened, everything is sent once: the
   * server keeps whichever copy is newer, so there is nothing to lose.
   */
  const since = startedAt < state.pushedAt ? 0 : state.pushedAt
  const changes = await localChanges(since, database)
  let cursor = state.cursor
  let received = 0

  const batches: Change[][] = []
  for (let i = 0; i < changes.length; i += BATCH) batches.push(changes.slice(i, i + BATCH))
  if (!batches.length) batches.push([])

  for (const batch of batches) {
    const answer = await send({ since: cursor, items: batch })
    received += await applyRemote(answer.items, database)
    cursor = answer.cursor
    while (answer.more) {
      const next = await send({ since: cursor, items: [] })
      received += await applyRemote(next.items, database)
      cursor = next.cursor
      answer.more = next.more
    }
  }

  /*
   * A millisecond before the round began, not the moment itself: a row written
   * in that same millisecond, after the changes had been gathered, would
   * otherwise count as already sent and stay on the device for ever. Sending it
   * twice costs nothing, since the server keeps whichever copy is newer.
   */
  await saveSyncState({ cursor, pushedAt: startedAt - 1, lastAt: Date.now() }, database)
  return { sent: changes.length, received, cursor }
}

/** Sends to the Worker. Separate so the tests can hand in the server directly. */
export const post: Send = async (body) => {
  const answer = await fetch('/sync', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!answer.ok) throw new Error(`El servidor respondió ${answer.status}`)
  return (await answer.json()) as Answer
}

/** How much this device holds, for deciding what happens on a first sign-in. */
export async function localCounts(database: BocadosDB = db): Promise<{ days: number; rows: number }> {
  const dates = new Set((await database.entries.toArray()).map((e) => e.date))
  const rows = (await Promise.all(SYNCED_TABLES.map((t) => database.table(t).count()))).reduce((a, b) => a + b, 0)
  return { days: dates.size, rows }
}

/** Everything this device holds, for replacing it with what the account has. */
export async function clearLocal(database: BocadosDB = db): Promise<void> {
  await withoutTombstones(async () => {
    for (const table of SYNCED_TABLES) await database.table(table).clear()
    await database.tombstones.clear()
  })
  await saveSyncState({ cursor: 0, pushedAt: Date.now() }, database)
}
