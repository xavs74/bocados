import { useEffect, useState } from 'react'
import { askConfirm } from '../lib/confirm'

interface Session {
  signedIn: boolean
  email?: string
  name?: string
  faltan?: string[]
}

const ERRORS: Record<string, string> = {
  estado: 'La vuelta desde Google no cuadró. Inténtalo otra vez.',
  token: 'Google no confirmó la identidad. Inténtalo otra vez.',
  identidad: 'Google no devolvió un correo.',
  cuenta: 'No se pudo crear tu cuenta. Inténtalo otra vez.',
  sincuentas: 'El servidor aún no tiene la base de datos de cuentas.',
  access_denied: 'No diste permiso, así que no se ha entrado.',
}

/**
 * The account: who you are, and the two things that must always be possible
 * with it — taking your data away and deleting it. What the server holds is
 * only that; the food, the days and the goals are still on this device alone.
 */
export function Account() {
  const [session, setSession] = useState<Session | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const error = params.get('error')

  useEffect(() => {
    let live = true
    fetch('/auth/yo', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s: Session) => live && setSession(s))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  async function signOut() {
    await fetch('/auth/salir', { method: 'POST', credentials: 'same-origin' })
    setSession({ signedIn: false })
    location.hash = '#/cuenta'
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
    const sure = await askConfirm('Se borra tu cuenta del servidor y las formas de entrar en ella. Lo que tienes apuntado en este móvil no se toca.', {
      title: '¿Borrar tu cuenta?',
      confirmLabel: 'Borrar',
      danger: true,
    })
    if (!sure) return
    setBusy(true)
    try {
      const answer = await fetch('/auth/borrar', { method: 'POST', credentials: 'same-origin' })
      if (!answer.ok) throw new Error('No se pudo borrar')
      setSession({ signedIn: false })
      setMessage('Tu cuenta se ha borrado.')
    } catch {
      setMessage('No se pudo borrar la cuenta. Inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="goals">
      <div className="page-head">
        <h1>Cuenta</h1>
        <span className="muted small-text">En pruebas</span>
      </div>

      <section className="card pad">
        <h2 className="section-title">{session?.signedIn ? 'Has entrado' : 'Entrar con Google'}</h2>
        <p className="hint">
          Por ahora una cuenta solo sirve para saber quién eres. Tus alimentos, tus días y tus objetivos siguen guardados únicamente en este dispositivo: todavía no se copian a
          ningún servidor.
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
            <button className="btn ghost block" onClick={signOut} disabled={busy}>
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

      {session?.signedIn && (
        <section className="card pad">
          <h2 className="section-title">Tus datos en el servidor</h2>
          <p className="hint">Solo tu correo, tu nombre y cómo entras. Puedes llevártelo o borrarlo cuando quieras.</p>
          <div className="footer-row">
            <button className="btn ghost grow" onClick={download} disabled={busy}>
              Descargar
            </button>
            <button className="btn danger-solid grow" onClick={removeAccount} disabled={busy}>
              Borrar mi cuenta
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
