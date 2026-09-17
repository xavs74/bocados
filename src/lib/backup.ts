import { db } from '../db'

const FORMAT = 'bocados-backup'
// Backups exported before the rename to Bocados.
const LEGACY_FORMAT = 'bocado-backup'

export async function exportBackup(): Promise<void> {
  const data = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    foods: await db.foods.toArray(),
    entries: await db.entries.toArray(),
    mealSets: await db.mealSets.toArray(),
    settings: await db.settings.toArray(),
  }
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
  const b = data as Record<string, unknown>
  if ((b?.format !== FORMAT && b?.format !== LEGACY_FORMAT) || !Array.isArray(b.foods) || !Array.isArray(b.entries) || !Array.isArray(b.settings)) {
    throw new Error('Ese archivo no es una copia de Bocados.')
  }
  await db.transaction('rw', db.foods, db.entries, db.mealSets, db.settings, async () => {
    await Promise.all([db.foods.clear(), db.entries.clear(), db.mealSets.clear(), db.settings.clear()])
    await db.foods.bulkAdd(b.foods as never[])
    await db.entries.bulkAdd(b.entries as never[])
    // Backups made before saved meals existed simply don't have them.
    await db.mealSets.bulkAdd((b.mealSets ?? []) as never[])
    await db.settings.bulkAdd(b.settings as never[])
  })
  return { foods: b.foods.length, entries: b.entries.length }
}
