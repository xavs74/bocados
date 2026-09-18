import { useState } from 'react'
import { createPortal } from 'react-dom'
import { saveGoals } from '../hooks'
import { isComplete, targetKcal, type Profile } from '../lib/energy'
import { kcal } from '../lib/format'
import type { Goals } from '../lib/nutrition'
import { PRESETS, type Split } from '../lib/split'
import { db } from '../db'
import { Breakdown, Calculator } from '../screens/Goals'

type Step = 'welcome' | 'calculate' | 'manual' | 'split'

/**
 * First-run setup: shown until the person has a goal of their own, so
 * nobody logs against a number that was never theirs.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('welcome')
  const [profile, setProfile] = useState<Partial<Profile>>({ formula: 'mifflin', adjustment: 0 })
  const [manualText, setManualText] = useState('')
  const [kcalGoal, setKcalGoal] = useState<number | null>(null)
  const [mode, setMode] = useState<'calculated' | 'manual'>('calculated')
  const [split, setSplit] = useState<Split>(PRESETS[0].split)

  async function finish() {
    if (!kcalGoal) return
    const goals: Goals = { kcal: kcalGoal, split, mode, profile: mode === 'calculated' ? profile : undefined }
    await saveGoals(goals)
    onDone()
  }

  async function later() {
    await db.settings.put({ key: 'onboardingSkipped', value: true })
    onDone()
  }

  const complete = isComplete(profile)

  return createPortal(
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="Primeros pasos">
      <div className="onboarding-card">
        {step === 'welcome' && (
          <>
            <h1>Bienvenido a Bocados</h1>
            <p>Apunta lo que comes y mira tus calorías y macros frente a tu objetivo. Todo se guarda solo en este dispositivo.</p>
            <p>Primero, vamos a calcular tu objetivo diario. Es un minuto.</p>
            <div className="onboarding-actions">
              <button className="btn primary block" onClick={() => setStep('calculate')}>
                Calcular mi objetivo
              </button>
              <button className="link-btn" onClick={later}>
                Lo haré luego
              </button>
            </div>
          </>
        )}

        {step === 'calculate' && (
          <>
            <h1>Tu objetivo</h1>
            <p className="hint">Con tus datos y tu actividad se estima lo que gastas al día, y se ajusta según quieras perder, mantener o ganar peso.</p>
            <Calculator profile={profile} onChange={setProfile} />
            {complete && <Breakdown profile={profile} />}
            <div className="onboarding-actions">
              <button
                className="btn primary block"
                disabled={!complete}
                onClick={() => {
                  setKcalGoal(targetKcal(profile as Profile))
                  setMode('calculated')
                  setStep('split')
                }}
              >
                {complete ? `Usar ${kcal(targetKcal(profile as Profile))} kcal` : 'Completa tus datos'}
              </button>
              <button className="link-btn" onClick={() => setStep('manual')}>
                Prefiero poner una cifra
              </button>
            </div>
          </>
        )}

        {step === 'manual' && (
          <>
            <h1>Tu objetivo</h1>
            <p className="hint">Si ya sabes cuántas calorías quieres comer al día (por ejemplo, te lo ha dicho un profesional), escríbelo aquí.</p>
            <label className="field">
              <span>Calorías al día</span>
              <div className="input-suffix">
                <input inputMode="numeric" value={manualText} onChange={(e) => setManualText(e.target.value.replace(/\D/g, ''))} autoFocus placeholder="2000" />
                <span>kcal</span>
              </div>
            </label>
            <div className="onboarding-actions">
              <button
                className="btn primary block"
                disabled={Number(manualText) < 800}
                onClick={() => {
                  setKcalGoal(Number(manualText))
                  setMode('manual')
                  setStep('split')
                }}
              >
                Continuar
              </button>
              <button className="link-btn" onClick={() => setStep('calculate')}>
                Mejor calcularlo
              </button>
            </div>
          </>
        )}

        {step === 'split' && kcalGoal && (
          <>
            <h1>Reparto de macros</h1>
            <p className="hint">Qué parte de tus {kcal(kcalGoal)} kcal viene de cada macro. Puedes cambiarlo cuando quieras en Objetivos.</p>
            <div className="choose-new">
              {PRESETS.map((p) => {
                const active = p.split === split
                return (
                  <button key={p.name} className={`choice-card ${active ? 'selected' : ''}`} aria-pressed={active} onClick={() => setSplit(p.split)}>
                    <strong>{p.name}</strong>
                    <span className="muted">
                      Carb {p.split.carbs} % · Prot {p.split.protein} % · Grasa {p.split.fat} %
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="onboarding-actions">
              <button className="btn primary block" onClick={finish}>
                Empezar
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
