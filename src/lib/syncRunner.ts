import { db, onLocalWrite } from '../db'
import { post, saveSyncState, syncOnce, syncState, type Send } from './sync'

/**
 * When syncing happens: once when the app opens, a few seconds after something
 * changes here (so a burst of typing is one round), and whenever the account
 * screen asks. Never in the way of anything on screen.
 *
 * It does nothing at all until the person has said what should happen to this
 * device's data, which the account screen asks on the first sign-in.
 */

const AFTER_CHANGE_MS = 4000
/** A failed round waits, doubling up to this, so a phone offline stops asking. */
const FIRST_RETRY_MS = 15_000
const MAX_RETRY_MS = 10 * 60_000

export type SyncStatus =
  | { state: 'off' }
  | { state: 'idle'; at?: number }
  | { state: 'syncing' }
  | { state: 'waiting'; error: string; until: number }

let status: SyncStatus = { state: 'off' }
let timer: ReturnType<typeof setTimeout> | undefined
let retry = FIRST_RETRY_MS
let running: Promise<void> | null = null
let stopWatching: (() => void) | null = null
let send: Send = post

const watchers = new Set<(s: SyncStatus) => void>()

export const getSyncStatus = () => status

export function watchSync(fn: (s: SyncStatus) => void): () => void {
  watchers.add(fn)
  return () => void watchers.delete(fn)
}

function setStatus(next: SyncStatus) {
  status = next
  for (const fn of watchers) fn(next)
}

/** Only for the tests: talk to something other than the Worker. */
export function sendThrough(fn: Send) {
  send = fn
}

/** Starts syncing if this device has been told to. Safe to call again. */
export async function startSync(): Promise<void> {
  const state = await syncState()
  if (!state.enabled) return
  if (!stopWatching) stopWatching = onLocalWrite(() => schedule(AFTER_CHANGE_MS))
  setStatus({ state: 'idle', at: state.lastAt })
  await syncNow()
}

/** Stops until told again: signing out, or turning syncing off on this device. */
export function stopSync(): void {
  stopWatching?.()
  stopWatching = null
  clearTimeout(timer)
  timer = undefined
  setStatus({ state: 'off' })
}

export async function enableSync(enabled: boolean): Promise<void> {
  await saveSyncState({ enabled })
  if (enabled) await startSync()
  else stopSync()
}

function schedule(delay: number) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

/**
 * One round, now. Rounds never overlap: a second call joins the first. The
 * slot is claimed before anything is awaited, or three calls at once would all
 * get past the check together.
 */
export function syncNow(): Promise<void> {
  if (running) return running

  running = (async () => {
    if (!(await syncState()).enabled) return
    setStatus({ state: 'syncing' })
    try {
      await syncOnce(send)
      retry = FIRST_RETRY_MS
      setStatus({ state: 'idle', at: Date.now() })
    } catch (e) {
      // Offline is the ordinary case, not a fault: wait longer each time.
      setStatus({ state: 'waiting', error: (e as Error).message, until: Date.now() + retry })
      schedule(retry)
      retry = Math.min(retry * 2, MAX_RETRY_MS)
    }
  })().finally(() => {
    running = null
  })

  return running
}

/** Forgets this device's place, for signing out. The data itself is untouched. */
export async function forgetSyncState(): Promise<void> {
  stopSync()
  await db.sync.clear()
}
