/**
 * The privacy policy, as a screen rather than a separate page, so it works
 * offline and inside the app on a home screen.
 *
 * Bump POLICY_VERSION whenever what is written here changes in a way that
 * matters: the version someone agreed to is kept with their account, so it is
 * clear what they were shown.
 */
export const POLICY_VERSION = '1'
export const POLICY_DATE = '24 de septiembre de 2026'
export const CONTACT = 'help@bocados.org'

export function Privacy() {
  return (
    <div className="goals privacy">
      {/* Reached from Objetivos as well as from Cuenta, so it goes back rather than somewhere. */}
      <button className="back-link" onClick={() => history.back()}>
        ‹ Volver
      </button>
      <div className="page-head">
        <h1>Privacidad</h1>
        <span className="muted small-text">Versión {POLICY_VERSION}</span>
      </div>

      <section className="card pad">
        <p className="hint">Actualizada el {POLICY_DATE}. En resumen: sin cuenta, nada sale de tu dispositivo. Con cuenta, se guarda en un servidor en la Unión Europea y puedes llevártelo o borrarlo cuando quieras.</p>
      </section>

      <section className="card pad">
        <h2 className="section-title">Sin cuenta</h2>
        <p>
          Bocados funciona entero sin entrar. Tus alimentos, tus días, tus pesos y tus objetivos se guardan solo en el navegador de este dispositivo. No hay analítica, ni
          publicidad, ni rastreo, ni cookies salvo las necesarias para entrar si decides hacerlo.
        </p>
        <p className="hint">Lo único que sale del dispositivo son las búsquedas de productos de supermercado: el texto que escribes o el código de barras que escaneas se consulta en Open Food Facts a través de nuestro servidor, sin decirle quién eres.</p>
      </section>

      <section className="card pad">
        <h2 className="section-title">Con cuenta</h2>
        <p>Si entras con Google, se guarda en el servidor tu correo, tu nombre y que entraste con Google. Eso es todo, hasta que aceptas sincronizar.</p>
        <p>
          Si aceptas sincronizar, se guardan también <strong>lo que comes, tus pesos, tus recetas, tus planes y tus objetivos</strong>, para que aparezcan en tus otros
          dispositivos. Eso son datos de salud, y por eso se te pide permiso expreso antes, y no antes de que lo des.
        </p>
        <ul className="privacy-list">
          <li>
            <strong>Quién responde de ellos:</strong> la persona que mantiene Bocados. Puedes escribir a <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </li>
          <li>
            <strong>Por qué se guardan:</strong> solo para que la app funcione en varios dispositivos. No se usan para nada más, no se venden y no se comparten.
          </li>
          <li>
            <strong>Con qué permiso:</strong> con tu consentimiento, que puedes retirar cuando quieras.
          </li>
          <li>
            <strong>Dónde:</strong> en Cloudflare, en una base de datos creada para quedarse en la Unión Europea.
          </li>
          <li>
            <strong>Cuánto tiempo:</strong> mientras tengas cuenta. Si la borras, se borra todo de inmediato.
          </li>
        </ul>
      </section>

      <section className="card pad">
        <h2 className="section-title">Quién más interviene</h2>
        <ul className="privacy-list">
          <li>
            <strong>Google</strong>, solo si entras con Google: te identifica y nos dice tu correo y tu nombre. No le contamos qué comes.
          </li>
          <li>
            <strong>Cloudflare</strong>, que aloja la app y la base de datos por encargo nuestro.
          </li>
          <li>
            <strong>Open Food Facts</strong>, para buscar productos de supermercado, sin datos tuyos.
          </li>
        </ul>
      </section>

      <section className="card pad">
        <h2 className="section-title">Tus derechos</h2>
        <p>
          Puedes ver, llevarte y borrar tus datos desde la propia app, en <strong>Cuenta</strong>: «Descargar» te da un archivo con lo que guarda el servidor, «Borrar mi cuenta»
          lo elimina todo. También puedes dejar de sincronizar y seguir usando Bocados sin cuenta.
        </p>
        <p className="hint">
          Si algo no funciona o quieres corregir datos, escribe a <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Si crees que no se tratan bien tus datos, puedes reclamar ante la
          Agencia Española de Protección de Datos.
        </p>
      </section>

      <section className="card pad">
        <h2 className="section-title">Menores</h2>
        <p className="hint">Bocados no está pensado para menores de 14 años. Si eres menor, usa la app sin cuenta o pide a quien te cuide que decida por ti.</p>
      </section>
    </div>
  )
}
