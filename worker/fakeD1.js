import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

/**
 * D1's shape over SQLite, for the tests. The Worker then runs the same SQL it
 * runs in production, against the same migrations that are applied to D1, so a
 * mistake in either shows up here rather than on someone's phone.
 *
 * Only for tests: nothing in the Worker imports it.
 */
export function fakeD1() {
  const db = new DatabaseSync(':memory:')
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(dir).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'))

  const prepare = (sql) => {
    const bound = (args) => {
      const run = () => db.prepare(sql).all(...args)
      return {
        args,
        sql,
        async first() {
          return run()[0] ?? null
        },
        async run() {
          return { success: true, results: run() }
        },
        async all() {
          return { success: true, results: run() }
        },
      }
    }
    return { bind: (...args) => bound(args), ...bound([]) }
  }

  return {
    prepare,
    async batch(statements) {
      // D1 runs a batch in one transaction; so does this.
      db.exec('BEGIN')
      try {
        const out = []
        for (const statement of statements) out.push(await statement.run())
        db.exec('COMMIT')
        return out
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    /** Straight to SQLite, for a test that wants to look behind the curtain. */
    raw: db,
  }
}
