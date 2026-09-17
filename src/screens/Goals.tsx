import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { SplitEditor } from '../components/SplitEditor'
import { DEFAULT_GOALS, db } from '../db'
import { saveGoals } from '../hooks'
import { exportBackup, importBackup } from '../lib/backup'
import {
  ACTIVITY,
  ADJUSTMENTS,
  FORMULAS,
  activityFactor,
  bmr,
  isComplete,
  targetKcal,
  tdee,
  type Profile,
} from '../lib/energy'
import { LOCALE, inputNum, kcal, parseNum } from '../lib/format'
import type { Goals as GoalsT } from '../lib/nutrition'
import type { Split } from '../lib/split'

const PRESETS: { name: string; split: Split }[] = [
  { name: 'Equilibrado', split: { carbs: 45, protein: 25, fat: 30 } },
  { name: 'Alto en proteína', split: { carbs: 35, protein: 35, fat: 30 } },
  { name: 'Bajo en carbohidratos', split: { carbs: 25, protein: 40, fat: 35 } },
]

export function Goals() {
  const row = useLiveQuery(() => db.settings.get('goals').then((r) => r ?? null))
  // Bumped after an import so the form starts again from the imported goals.
  const [generation, setGeneration] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onImport(file: File) {
    if (!confirm('Al importar se reemplazan todos los alimentos, los días registrados y los objetivos de este dispositivo. ¿Continuar?')) return
    try {
      const r = await importBackup(file)
      setGeneration((g) => g + 1)
      setMessage(`Importados ${r.foods} alimentos y ${r.entries} registros.`)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  return (
    <div className="goals">
      <div className="page-head">
        <h1>Objetivos</h1>
        <span className="muted small-text">Los cambios se guardan solos</span>
      </div>

      {row !== undefined && <GoalsForm key={generation} initial={(row?.value as GoalsT | undefined) ?? DEFAULT_GOALS} />}

      <section className="card pad">
        <h2 className="section-title">Tus datos</h2>
        <p className="hint">
          Todo se guarda solo en este dispositivo. Exporta una copia para no perder nada o para pasarla a otro móvil u ordenador, y después impórtala allí.
        </p>
        <div className="footer-row">
          <button className="btn ghost grow" onClick={exportBackup}>
            Exportar copia
          </button>
          <button className="btn ghost grow" onClick={() => fileRef.current?.click()}>
            Importar copia
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) onImport(f)
            }}
          />
        </div>
        {message && (
          <p className="hint" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  )
}

function GoalsForm({ initial }: { initial: GoalsT }) {
  const [goals, setGoals] = useState<GoalsT>(initial)
  const [kcalText, setKcalText] = useState(String(initial.kcal))
  const mode = goals.mode ?? 'manual'

  function update(next: GoalsT) {
    // In calculated mode the target follows the profile whenever it's complete.
    if (next.mode === 'calculated' && isComplete(next.profile)) next = { ...next, kcal: targetKcal(next.profile) }
    setGoals(next)
    if (next.kcal > 0) saveGoals(next)
  }

  function setMode(m: 'manual' | 'calculated') {
    const next = { ...goals, mode: m }
    update(next)
    if (m === 'manual') setKcalText(String(goals.kcal))
  }

  return (
    <>
      <section className="card pad">
        <h2 className="section-title">Calorías diarias</h2>
        <div className="segmented two" role="radiogroup" aria-label="Cómo fijar las calorías">
          {(
            [
              ['manual', 'Fijar yo'],
              ['calculated', 'Calcular'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'manual' ? (
          <label className="field top-gap">
            <span>Objetivo</span>
            <div className="input-suffix">
              <input
                inputMode="numeric"
                value={kcalText}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const text = e.target.value.replace(/\D/g, '')
                  setKcalText(text)
                  update({ ...goals, kcal: Number(text) })
                }}
                aria-invalid={!(goals.kcal > 0)}
              />
              <span>kcal</span>
            </div>
          </label>
        ) : (
          <Calculator profile={goals.profile ?? {}} onChange={(profile) => update({ ...goals, profile })} />
        )}
      </section>

      <section className="card pad">
        <h2 className="section-title">Reparto de macros</h2>
        <p className="hint">Qué parte de tus calorías viene de cada macro. Carbohidratos y proteínas tienen 4 kcal por gramo; las grasas, 9.</p>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="btn ghost small" onClick={() => update({ ...goals, split: p.split })}>
              {p.name}
            </button>
          ))}
        </div>
        <SplitEditor split={goals.split} kcal={goals.kcal} onChange={(split) => update({ ...goals, split })} />
      </section>
    </>
  )
}

const NUM_FIELDS = [
  ['age', 'Edad', 'años'],
  ['heightCm', 'Altura', 'cm'],
  ['weightKg', 'Peso', 'kg'],
] as const

function Calculator({ profile, onChange }: { profile: Partial<Profile>; onChange: (p: Partial<Profile>) => void }) {
  const [texts, setTexts] = useState(() =>
    Object.fromEntries(NUM_FIELDS.map(([k]) => [k, profile[k] === undefined ? '' : inputNum(profile[k])])),
  )
  const p: Partial<Profile> = { formula: 'mifflin', adjustment: 0, ...profile }
  const complete = isComplete(p)

  function set(patch: Partial<Profile>) {
    onChange({ ...p, ...patch })
  }

  return (
    <div className="calculator">
      <div className="field top-gap">
        <span className="field-label">Sexo</span>
        <div className="segmented two" role="radiogroup" aria-label="Sexo">
          {(
            [
              ['female', 'Mujer'],
              ['male', 'Hombre'],
            ] as const
          ).map(([s, label]) => (
            <button key={s} type="button" role="radio" aria-checked={p.sex === s} className={p.sex === s ? 'active' : ''} onClick={() => set({ sex: s })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-3">
        {NUM_FIELDS.map(([key, label, unit]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <div className="input-suffix">
              <input
                inputMode="decimal"
                value={texts[key]}
                onChange={(e) => {
                  setTexts({ ...texts, [key]: e.target.value })
                  const v = parseNum(e.target.value)
                  set({ [key]: Number.isFinite(v) ? v : undefined })
                }}
              />
              <span>{unit}</span>
            </div>
          </label>
        ))}
      </div>

      <label className="field">
        <span>Actividad física</span>
        <select value={p.activity ?? ''} onChange={(e) => set({ activity: e.target.value as Profile['activity'] })}>
          <option value="" disabled>
            Elige tu nivel
          </option>
          {ACTIVITY.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}: {a.hint.toLowerCase()}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="fieldset">
        <legend className="field-label">Tu objetivo</legend>
        <div className="choice-list">
          {ADJUSTMENTS.map((a) => (
            <label key={a.kcal} className={`choice ${p.adjustment === a.kcal ? 'active' : ''}`}>
              <input type="radio" name="adjustment" checked={p.adjustment === a.kcal} onChange={() => set({ adjustment: a.kcal })} />
              <span className="choice-main">{a.label}</span>
              <span className="choice-side muted">
                {a.kcal > 0 ? '+' : a.kcal < 0 ? '−' : ''}
                {kcal(Math.abs(a.kcal))} kcal · {a.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Fórmula</span>
        <select value={p.formula} onChange={(e) => set({ formula: e.target.value as Profile['formula'] })}>
          {FORMULAS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      {complete ? (
        <Breakdown profile={p} />
      ) : (
        <p className="hint result-empty">Completa sexo, edad, altura, peso y actividad para calcular tus calorías.</p>
      )}
    </div>
  )
}

function Breakdown({ profile }: { profile: Profile }) {
  const basal = bmr(profile)
  const burn = tdee(profile)
  const target = targetKcal(profile)
  return (
    <div className="breakdown" aria-live="polite">
      <div className="breakdown-row">
        <span>Metabolismo basal</span>
        <strong>{kcal(basal)} kcal</strong>
      </div>
      <div className="breakdown-row">
        <span>Gasto diario (× {activityFactor(profile).toLocaleString(LOCALE)} por actividad)</span>
        <strong>{kcal(burn)} kcal</strong>
      </div>
      <div className="breakdown-row">
        <span>{profile.adjustment < 0 ? 'Déficit' : profile.adjustment > 0 ? 'Exceso' : 'Ajuste'}</span>
        <strong>
          {profile.adjustment > 0 ? '+' : profile.adjustment < 0 ? '−' : ''}
          {kcal(Math.abs(profile.adjustment))} kcal
        </strong>
      </div>
      <div className="breakdown-row total">
        <span>Tu objetivo</span>
        <strong>{kcal(target)} kcal</strong>
      </div>
      {target < basal && <p className="hint warn">Este objetivo queda por debajo de tu metabolismo basal. Mejor no bajar de ahí sin consultar a un profesional.</p>}
    </div>
  )
}
