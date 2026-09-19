import { db } from '../db'
import { Sheet } from './Sheet'

/**
 * Welcome shown once, over the app, while the person has no goal of their
 * own. It points to Objetivos rather than duplicating it.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  async function dismiss(goToGoals: boolean) {
    await db.settings.put({ key: 'onboardingSkipped', value: true })
    if (goToGoals) location.hash = '#/goals'
    onDone()
  }

  return (
    <Sheet
      dismissible={false}
      title="Bienvenido a Bocados"
      onClose={() => dismiss(false)}
      footer={
        <div className="footer-row">
          <button className="btn ghost" onClick={() => dismiss(false)}>
            Lo haré luego
          </button>
          <button className="btn primary grow" onClick={() => dismiss(true)}>
            Calcular mi objetivo
          </button>
        </div>
      }
    >
      <div className="welcome">
        <p>Apunta lo que comes y mira tus calorías y macros frente a tu objetivo. Todo se guarda solo en este dispositivo.</p>
        <p>
          Antes de empezar, calcula tu objetivo diario en <strong>Objetivos</strong>: con tu edad, altura, peso y actividad se estima lo que gastas, y se ajusta según quieras
          perder, mantener o ganar peso. Es un minuto.
        </p>
      </div>
    </Sheet>
  )
}
