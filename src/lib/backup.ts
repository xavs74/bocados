import { db, withoutTombstones } from '../db'

const FORMAT = 'bocados-backup'
// Backups exported before the rename to Bocados.
const LEGACY_FORMAT = 'bocado-backup'

export interface Backup {
  format: string
  version: number
  exportedAt: string
  [table: string]: unknown
}

/**
 * Tables deliberately left out of a copy. The snapshot is what everything
 * looked like before the identifiers changed: keeping it would double the size
 * of every backup, and it is only useful on the device that made it. How far
 * syncing has got belongs to the device too: another phone restoring it would
 * think it had already seen everything.
 */
const SKIP = ['snapshots', 'migration', 'sync']

/**
 * Everything in the database, table by table. The tables come from Dexie rather
 * than a list written here, so a table added later can't be left out of backups
 * by mistake and lost on the next restore.
 */
export async function collectBackup(): Promise<Backup> {
  const tables = await Promise.all(db.tables.filter((t) => !SKIP.includes(t.name)).map(async (t) => [t.name, await t.toArray()] as const))
  return {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    ...Object.fromEntries(tables),
  }
}

export async function exportBackup(): Promise<void> {
  const data = await collectBackup()
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bocados-copia-${data.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Replaces everything on this device with the backup's contents. */
export async function importBackup(file: File): Promise<{ foods: number; entries: number }> {
  let data: unknown
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('Ese archivo no se puede leer.')
  }
  return restoreBackup(data)
}

export async function restoreBackup(data: unknown): Promise<{ foods: number; entries: number }> {
  const b = data as Backup
  if ((b?.format !== FORMAT && b?.format !== LEGACY_FORMAT) || !Array.isArray(b.foods) || !Array.isArray(b.entries) || !Array.isArray(b.settings)) {
    throw new Error('Ese archivo no es una copia de Bocados.')
  }
  const tables = db.tables.filter((t) => !SKIP.includes(t.name))
  // Emptying the tables here is not deleting anyone's food: it is replacing it
  // with the copy, so none of it is marked as deleted for other devices.
  await withoutTombstones(() =>
    db.transaction('rw', tables, async () => {
      await Promise.all(tables.map((t) => t.clear()))
      for (const table of tables) {
        // Backups made before a table existed simply don't carry it.
        const rows = b[table.name]
        if (Array.isArray(rows) && rows.length) await table.bulkAdd(rows as never[])
      }
    }),
  )
  return { foods: b.foods.length, entries: b.entries.length }
}
