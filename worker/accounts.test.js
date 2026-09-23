import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { cleanEmail, deleteUser, exportUser, getUser, signIn } from './accounts.js'

/**
 * D1's shape over SQLite, so the tests run the same SQL the Worker runs,
 * against the same schema file that is applied to D1.
 */
function fakeD1() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0001_cuentas.sql', import.meta.url), 'utf8'))
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const statement = db.prepare(sql)
          return {
            async first() {
              return statement.get(...args) ?? null
            },
            async run() {
              return statement.run(...args)
            },
            async all() {
              return { results: statement.all(...args) }
            },
          }
        },
      }
    },
  }
}

const google = (over = {}) => ({ provider: 'google', subject: '1234', email: 'Xavi.RAG@gmail.com', name: 'Xavi Ramírez', ...over })

describe('signIn', () => {
  let db
  beforeEach(() => {
    db = fakeD1()
  })

  it('creates the account the first time', async () => {
    const user = await signIn(db, google({ now: '2026-09-23T10:00:00.000Z' }))
    expect(user.email).toBe('xavi.rag@gmail.com') // kept lower case
    expect(user.name).toBe('Xavi Ramírez')
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(user.created_at).toBe('2026-09-23T10:00:00.000Z')
  })

  it('gives the same account back next time, and notes the visit', async () => {
    const first = await signIn(db, google({ now: '2026-09-23T10:00:00.000Z' }))
    const second = await signIn(db, google({ now: '2026-09-24T09:00:00.000Z' }))
    expect(second.id).toBe(first.id)
    expect(second.seen_at).toBe('2026-09-24T09:00:00.000Z')
    expect(second.created_at).toBe('2026-09-23T10:00:00.000Z')
  })

  it('keeps one account when the same person signs in another way', async () => {
    const withGoogle = await signIn(db, google())
    const withCode = await signIn(db, { provider: 'email', subject: 'xavi.rag@gmail.com', email: 'xavi.rag@gmail.com' })
    expect(withCode.id).toBe(withGoogle.id)
    const taken = await exportUser(db, withGoogle.id)
    expect(taken.formas_de_entrar.map((i) => i.provider).sort()).toEqual(['email', 'google'])
  })

  it('keeps different people apart', async () => {
    const mine = await signIn(db, google())
    const hers = await signIn(db, google({ subject: '5678', email: 'madre@example.com', name: 'Madre' }))
    expect(hers.id).not.toBe(mine.id)
  })

  it('takes a new name from the provider but never an empty one', async () => {
    const user = await signIn(db, google())
    expect((await signIn(db, google({ name: 'Xavier Ramírez' }))).name).toBe('Xavier Ramírez')
    expect((await signIn(db, google({ name: '' }))).name).toBe('Xavier Ramírez')
    expect((await getUser(db, user.id)).name).toBe('Xavier Ramírez')
  })

  it('starts again if the account was deleted but the identity lingered', async () => {
    const user = await signIn(db, google())
    await db.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run()
    const again = await signIn(db, google())
    expect(again.id).not.toBe(user.id)
    expect(again.email).toBe('xavi.rag@gmail.com')
  })

  it('refuses an identity it does not know or one without an email', async () => {
    await expect(signIn(db, google({ provider: 'facebook' }))).rejects.toThrow('Unknown provider')
    await expect(signIn(db, google({ email: '' }))).rejects.toThrow('subject and an email')
  })
})

describe('exportUser and deleteUser', () => {
  let db
  beforeEach(() => {
    db = fakeD1()
  })

  it('hands over everything the server holds', async () => {
    const user = await signIn(db, google())
    const taken = await exportUser(db, user.id)
    expect(taken.cuenta.email).toBe('xavi.rag@gmail.com')
    expect(taken.formas_de_entrar).toEqual([{ provider: 'google', subject: '1234', created_at: expect.any(String) }])
    expect(taken.nota).toContain('no guarda en el servidor')
  })

  it('leaves nothing behind', async () => {
    const user = await signIn(db, google())
    expect(await deleteUser(db, user.id)).toBe(true)
    expect(await getUser(db, user.id)).toBeNull()
    expect(await exportUser(db, user.id)).toBeNull()
    const { results } = await db.prepare('SELECT * FROM identities').bind().all()
    expect(results).toEqual([])
  })

  it('says so when there is nothing to delete', async () => {
    expect(await deleteUser(db, 'no-existe')).toBe(false)
  })
})

describe('cleanEmail', () => {
  it('trims and lowercases', () => {
    expect(cleanEmail('  Xavi.RAG@Gmail.com ')).toBe('xavi.rag@gmail.com')
    expect(cleanEmail(undefined)).toBe('')
  })
})
