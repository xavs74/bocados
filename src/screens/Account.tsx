import { useCallback, useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { exportBackup } from '../lib/backup'
import { askConfirm } from '../lib/confirm'
import { clearLocal, localCounts, syncState } from '../lib/sync'
import { POLICY_VERSION } from './Privacy'
import { enableSync, forgetSyncState, getSyncStatus, syncNow, watchSync, type SyncStatus } from '../lib/syncRunner'

interface Session {
  signedIn: boolean
  email?: string
  name?: string
  faltan?: string[]
}

interface Counts {
  rows: number
  days: number
}

const ERRORS: Record<string, string> = {
  estado: 'La vuelta desde Google no cuadró. Inténtalo otra vez.',
  token: 'Google no confirmó la identidad. Inténtalo otra vez.',
  identidad: 'Google no devolvió un correo.',
  cuenta: 'No se pudo crear tu cuenta. Inténtalo otra vez.',
  sincuentas: 'El servidor aún no tiene la base de datos de cuentas.',
  access_denied: 'No diste permiso, así que no se ha entrado.',
}

const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/**
 * The account, and what syncing does with this device's data. The first time
 * someone signs in on a phone that already has days on it, this is where they
 * decide what happens to them; after that it shows how syncing is going.
 */
export function Account() {
  const [session, setSession] = useState<Session | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [mine, setMine] = useState<Counts | null>(null)
  const [account, setAccount] = useState<Counts | null>(null)
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus)
  const [leaving, setLeaving] = useState(false)
  /** null while unknown; the date it was given, or '' for not yet. */
  const [consent, setConsent] = useState<string | null>(null)
  const [accepts, setAccepts] = useState(false)
  const error = new URLSearchParams(location.hash.split('?')[1] ?? '').get('error')

  const look = useCallback(async () => {
    const given = await fetch('/auth/consentimiento', { credentials: 'same-origin' })
    if (given.ok) setConsent(((await given.json()) as { consentAt: string | null }).consentAt ?? '')

    const state = await syncState()
    setEnabled(!!state.enabled)
    const here = await localCounts()
    setMine({ rows: here.rows, days: here.days })
    if (state.enabled) return
    // Only needed before deciding: after that the counts are the same thing.
    const answer = await fetch('/sync', { credentials: 'same-origin' })
    if (answer.ok) setAccount((await answer.json()) as Counts)
  }, [])

  useEffect(() => watchSync(setStatus), [])

  useEffect(() => {
    let live = true
    fetch('/auth/yo', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(async (s: Session) => {
        if (!live) return
        setSession(s)
        if (s.signedIn) await look()
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [look])

  /** An account with nothing in it simply takes what this device has. */
  useEffect(() => {
    if (enabled !== false || !consent || !account || account.rows > 0) return
    void (async () => {
      await enableSync(true)
      setEnabled(true)
      setMessage('Tus datos se están guardando en tu cuenta.')
    })()
  }, [enabled, account, consent])

  /** Nothing of anyone's food travels before this. */
  async function accept() {
    setBusy(true)
    try {
      const answer = await fetch('/auth/consentimiento', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true, version: POLICY_VERSION }),
      })
      if (!answer.ok) throw new Error('No se pudo guardar')
      setConsent(((await answer.json()) as { consentAt: string }).consentAt)
      await look()
    } catch {
      setMessage('No se pudo guardar tu respuesta. Inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  /** Stops syncing and forgets the permission; what is stored is removed separately. */
  async function withdraw() {
    const sure = await askConfirm('Se deja de sincronizar en todos tus dispositivos. Lo que ya está en el servidor se borra desde «Borrar mi cuenta».', {
      title: '¿Dejar de sincronizar?',
      confirmLabel: 'Dejar de sincronizar',
      danger: true,
    })
    if (!sure) return
    setBusy(true)
    try {
      await fetch('/auth/consentimiento', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: false }),
      })
      await enableSync(false)
      setConsent('')
      setEnabled(false)
      setMessage('Ya no se sincroniza nada. Lo que tienes aquí sigue en este móvil.')
    } finally {
      setBusy(false)
    }
  }

  async function decide(keepAccount: boolean) {
    setBusy(true)
    try {
      if (keepAccount) {
        // A copy first: this replaces what is on the phone.
        await exportBackup()
        await clearLocal()
      }
      await enableSync(true)
      setEnabled(true)
      await syncNow()
      setMessage(keepAccount ? 'Este móvil ahora tiene lo de tu cuenta.' : 'Se han juntado los dos.')
      await look()
    } catch {
      setMessage('No se pudo sincronizar. Inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  /** Leaving asks what to do with what is on the phone; keeping it is the default. */
  async function signOut(wipe: boolean) {
    setLeaving(false)
    setBusy(true)
    try {
      if (wipe) await clearLocal()
      await fetch('/auth/salir', { method: 'POST', credentials: 'same-origin' })
      await forgetSyncState()
      setSession({ signedIn: false })
      setEnabled(false)
      setMine(await localCounts())
      setMessage(wipe ? 'Has salido y este móvil se ha quedado vacío.' : 'Has salido. Lo apuntado sigue en este móvil.')
    } finally {
      setBusy(false)
    }
  }

  async function wipeDevice() {
    const sure = await askConfirm('Se borra de este móvil todo lo apuntado. Seguirá guardado en tu cuenta, y volverá si vuelves a entrar.', {
      title: '¿Borrar los datos de este móvil?',
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!sure) return
    setBusy(true)
    await clearLocal()
    await look()
    setBusy(false)
    setMessage('Este móvil se ha quedado vacío.')
  }

  async function download() {
    setBusy(true)
    try {
      const answer = await fetch('/auth/exportar', { credentials: 'same-origin' })
      if (!answer.ok) throw new Error('No se pudo descargar')
      const blob = new Blob([JSON.stringify(await answer.json(), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bocados-cuenta.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setMessage('No se pudieron descargar tus datos. Inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAccount() {
    const sure = await askConfirm('Se borra tu cuenta del servidor, con todo lo que se haya sincronizado. Lo que tienes en este móvil se queda como está.', {
      title: '¿Borrar tu cuenta?',
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!sure) return
    setBusy(true)
    try {
      const answer = await fetch('/auth/borrar', { method: 'POST', credentials: 'same-origin' })
      if (!answer.ok) throw new Error('No se pudo borrar')
      await forgetSyncState()
      setSession({ signedIn: false })
      setEnabled(false)
      setMessage('Tu cuenta se ha borrado.')
    } catch {
      setMessage('No se pudo borrar la cuenta. Inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  const asking = session?.signedIn && consent === ''
  const deciding = session?.signedIn && !!consent && enabled === false && account && account.rows > 0

  return (
    <div className="goals">
      <div className="page-head">
        <h1>Cuenta</h1>
      </div>

      <section className="card pad">
        <h2 className="section-title">{session?.signedIn ? 'Has entrado' : 'Entrar con Google'}</h2>
        <p className="hint">
          Con una cuenta, lo que apuntas se guarda también en el servidor y aparece en tus otros móviles. Sin ella, Bocados funciona igual pero todo se queda solo en este
          dispositivo.
        </p>

        {error && <p className="hint warn">{ERRORS[error] ?? 'No se pudo entrar. Inténtalo otra vez.'}</p>}
        {failed && <p className="hint warn">No se pudo hablar con el servidor. ¿Estás sin conexión?</p>}
        {message && <p className="hint">{message}</p>}
        {session?.faltan && <p className="hint warn">Al servidor le falta configurar: {session.faltan.join(', ')}.</p>}

        {session === null && !failed && <p className="empty">Comprobando…</p>}

        {session?.signedIn ? (
          <>
            <p className="big-number">
              <strong>{session.name || session.email}</strong>
            </p>
            {session.name && <p className="hint">{session.email}</p>}
            <button className="btn ghost block" onClick={() => setLeaving(true)} disabled={busy}>
              Salir
            </button>
          </>
        ) : (
          session && (
            <a className="btn primary block" href="/auth/google">
              Entrar con Google
            </a>
          )
        )}
      </section>

      {asking && (
        <section className="card pad suggestion" aria-label="Permiso para sincronizar">
          <h2 className="section-title">¿Guardamos tus comidas en tu cuenta?</h2>
          <p>
            Para que lo que apuntas aparezca en tus otros dispositivos hay que guardarlo en el servidor: lo que comes, tus pesos, tus recetas, tus planes y tus objetivos. Son
            datos de salud, así que no se guarda nada sin que lo digas tú.
          </p>
          <p className="hint">Se guardan en la Unión Europea, solo para esto, y puedes llevártelos o borrarlos cuando quieras.</p>
          <label className="check-line">
            <input type="checkbox" checked={accepts} onChange={(e) => setAccepts(e.target.checked)} />
            <span>
              He leído la <a href="#/privacidad">política de privacidad</a> y acepto que se guarden.
            </span>
          </label>
          <div className="footer-row">
            <button className="btn primary grow" onClick={accept} disabled={!accepts || busy}>
              Sincronizar
            </button>
          </div>
          <p className="hint">Si no, Bocados sigue funcionando igual y todo se queda solo en este dispositivo.</p>
        </section>
      )}

      {deciding && account && mine && (
        <section className="card pad suggestion" aria-label="Qué hacer con los datos de este móvil">
          <h2 className="section-title">Este móvil ya tiene datos</h2>
          <p>
            Tu cuenta tiene <strong>{days(account.days)} apuntados</strong>. Este móvil tiene <strong>{days(mine.days)}</strong>.
          </p>
          <p className="hint">
            Si usas los de la cuenta, lo de este móvil se reemplaza (antes se descarga una copia). Si los juntas, no se pierde nada, aunque puede que algún alimento acabe repetido.
          </p>
          <div className="footer-row">
            <button className="btn ghost grow" onClick={() => decide(false)} disabled={busy}>
              Juntarlos
            </button>
            <button className="btn primary grow" onClick={() => decide(true)} disabled={busy}>
              Usar los de la cuenta
            </button>
          </div>
        </section>
      )}

      {session?.signedIn && enabled && (
        <section className="card pad" aria-label="Sincronización">
          <div className="card-head">
            <h2 className="section-title">Sincronización</h2>
            <button className="btn ghost small" onClick={() => void syncNow()} disabled={busy || status.state === 'syncing'}>
              Sincronizar ahora
            </button>
          </div>
          <p className="hint">{describe(status)}</p>
          <p className="hint">
            Aceptaste guardar tus datos el {new Date(consent as string).toLocaleDateString('es-ES')}.{' '}
            <button className="link-btn" onClick={withdraw} disabled={busy}>
              Dejar de sincronizar
            </button>
          </p>
          {mine && (
            <p className="hint">
              En este móvil: {days(mine.days)} apuntados, {mine.rows} filas en total.
            </p>
          )}
        </section>
      )}

      {leaving && (
        <Sheet
          title="¿Salir de tu cuenta?"
          onClose={() => setLeaving(false)}
          footer={
            <div className="footer-row">
              <button className="btn ghost" onClick={() => setLeaving(false)}>
                Cancelar
              </button>
              <button className="btn primary grow" onClick={() => void signOut(false)}>
                Dejarlos aquí
              </button>
            </div>
          }
        >
          <p className="confirm-message">
            Tu cuenta no se toca: todo lo sincronizado sigue en ella, y vuelve cuando entres otra vez. Lo que hay en este móvil puedes dejarlo o borrarlo.
          </p>
          <button className="btn danger-solid block" onClick={() => void signOut(true)}>
            Salir y borrarlos de este móvil
          </button>
          <p className="hint">Bórralos si este móvil no es tuyo.</p>
        </Sheet>
      )}

      {session?.signedIn && (
        <section className="card pad">
          <h2 className="section-title">Tus datos</h2>
          <p className="hint">
            Puedes llevarte lo que guarda el servidor, vaciar este móvil, o borrar la cuenta entera. Qué se guarda y por qué, en la{' '}
            <a href="#/privacidad">política de privacidad</a>.
          </p>
          <div className="footer-row">
            <button className="btn ghost grow" onClick={download} disabled={busy}>
              Descargar
            </button>
            <button className="btn ghost grow" onClick={wipeDevice} disabled={busy || !enabled}>
              Vaciar este móvil
            </button>
          </div>
          <button className="btn danger-solid block" onClick={removeAccount} disabled={busy}>
            Borrar mi cuenta
          </button>
        </section>
      )}
    </div>
  )
}

function describe(status: SyncStatus): string {
  if (status.state === 'syncing') return 'Sincronizando…'
  if (status.state === 'waiting') return `Sin conexión con el servidor (${status.error}). Se vuelve a intentar solo.`
  if (status.state === 'idle' && status.at) return `Al día. Última vez: ${new Date(status.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`
  return 'Al día.'
}
