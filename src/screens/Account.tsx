import { useEffect, useState } from 'react'

interface Session {
  signedIn: boolean
  email?: string
  name?: string
}

const ERRORS: Record<string, string> = {
  estado: 'La vuelta desde Google no cuadró. Inténtalo otra vez.',
  token: 'Google no confirmó la identidad. Inténtalo otra vez.',
  identidad: 'Google no devolvió un correo.',
  access_denied: 'No diste permiso, así que no se ha entrado.',
}

/**
 * A first test of signing in, nothing more: no data is sent anywhere and
 * nothing is stored on the server. It exists to answer one question — whether
 * the trip out to Google and back lands inside the app on a phone.
 */
export function Account() {
  const [session, setSession] = useState<Session | null>(null)
  const [failed, setFailed] = useState(false)
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

  return (
    <div className="goals">
      <div className="page-head">
        <h1>Cuenta</h1>
        <span className="muted small-text">En pruebas</span>
      </div>

      <section className="card pad">
        <h2 className="section-title">Entrar con Google</h2>
        <p className="hint">
          Esto es una prueba para ver si entrar funciona bien desde el móvil. Todavía no se guarda nada fuera de este dispositivo: tus alimentos, tus días y tus objetivos siguen
          solo aquí.
        </p>

        {error && <p className="hint warn">{ERRORS[error] ?? 'No se pudo entrar. Inténtalo otra vez.'}</p>}
        {failed && <p className="hint warn">No se pudo hablar con el servidor. ¿Estás sin conexión?</p>}

        {session === null && !failed && <p className="empty">Comprobando…</p>}

        {session?.signedIn ? (
          <>
            <p className="big-number">
              <strong>{session.name || session.email}</strong>
            </p>
            {session.name && <p className="hint">{session.email}</p>}
            <button className="btn ghost block" onClick={signOut}>
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
    </div>
  )
}
