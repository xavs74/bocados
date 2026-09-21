import { goalsAreSet } from '../lib/goals'
import { goalGrams } from '../lib/nutrition'
import { MAX_PER_KG, MIN_PER_KG, defaultProteinPerKg, referenceWeight, splitFromProtein } from '../lib/protein'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { SplitEditor } from '../components/SplitEditor'
import { DEFAULT_GOALS, MEALS, MEAL_LABEL, db, type Meal } from '../db'
import { saveGoals, saveMeals, useMeals } from '../hooks'
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
import { LOCALE, inputNum, kcal, num, parseNum } from '../lib/format'
import { MACROS, MACRO_SHORT, type Goals as GoalsT } from '../lib/nutrition'
import { PRESETS } from '../lib/split'
import { askConfirm } from '../lib/confirm'


export function Goals() {
  const row = useLiveQuery(() => db.settings.get('goals').then((r) => r ?? null))
  // Bumped after an import so the form starts again from the imported goals.
  const [generation, setGeneration] = useState(0)
  // Read straight after an import: the live query may not have caught up yet,
  // and a form showing the old values would save them back over the import.
  const [imported, setImported] = useState<GoalsT | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onImport(file: File) {
    if (!(await askConfirm('Al importar se reemplazan todos los alimentos, los días registrados y los objetivos de este dispositivo.', { title: '¿Importar la copia?', confirmLabel: 'Importar', danger: true }))) return
    try {
      const r = await importBackup(file)
      setImported(((await db.settings.get('goals'))?.value as GoalsT | undefined) ?? DEFAULT_GOALS)
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

      {row !== undefined && <GoalsForm key={generation} initial={imported ?? (row?.value as GoalsT | undefined) ?? DEFAULT_GOALS} />}

      <MealsCard />

      <section className="card pad">
        <h2 className="section-title">Cuenta</h2>
        <p className="hint">Una prueba para ver si entrar con Google funciona bien desde el móvil. Tus datos siguen guardados solo en este dispositivo.</p>
        <a className="btn ghost block" href="#/cuenta">
          Probar la cuenta
        </a>
      </section>

      <section className="card pad">
        <h2 className="section-title">Alimentos y recetas</h2>
        <p className="hint">Tu lista de alimentos, los productos que escaneas y tus recetas.</p>
        <a className="btn ghost block" href="#/foods">
          <FoodsIcon /> Abrir alimentos
        </a>
      </section>

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
  // Decided once, when the screen opens: the first autosave marks the goals as set.
  const [isNew] = useState(() => !goalsAreSet(initial))
  // New people start on the calculator; older manual goals had no mode.
  const mode = goals.mode ?? (isNew ? 'calculated' : 'manual')

  function update(next: GoalsT) {
    // Store the mode explicitly: working it out from "has a goal been set" flips it the moment the first change is saved.
    next = { ...next, mode: next.mode ?? mode }
    const calculated = next.mode === 'calculated' && isComplete(next.profile)
    // In calculated mode the target follows the profile whenever it's complete.
    // With a burn measured from their own data, that replaces the formula's estimate.
    if (calculated) next = { ...next, kcal: next.measuredTdee ? Math.round(next.measuredTdee + (next.profile as Profile).adjustment) : targetKcal(next.profile as Profile) }
    // New people get protein by weight as soon as their data is complete.
    if (calculated && next.proteinPerKg === undefined && isNew)
      next = { ...next, proteinPerKg: defaultProteinPerKg((next.profile as Profile).adjustment) }
    // Changing the goal (lose, keep, gain) moves g/kg to its default, unless the person picked their own value.
    const prevAdj = goals.profile?.adjustment
    const nextAdj = next.profile?.adjustment
    if (next.proteinPerKg && !next.proteinCustom && prevAdj !== undefined && nextAdj !== undefined && prevAdj !== nextAdj)
      next = { ...next, proteinPerKg: defaultProteinPerKg(nextAdj) }
    // Protein by weight needs a weight: without the calculator it falls back to percentages.
    if (next.proteinPerKg && !calculated) next = { ...next, proteinPerKg: undefined }
    if (next.proteinPerKg && calculated)
      next = { ...next, split: splitFromProtein(next.kcal, referenceWeight(next.profile as Profile).kg, next.proteinPerKg).split }
    setGoals(next)
    if (next.kcal > 0) saveGoals(next)
  }

  function setMode(m: 'manual' | 'calculated') {
    const next = { ...goals, mode: m }
    update(next)
    if (m === 'manual') setKcalText(String(goals.kcal))
  }

  return (
    <div className="goals-grid">
      <section className="card pad">
        <h2 className="section-title">Calorías diarias</h2>
        <div className="segmented two" role="radiogroup" aria-label="Cómo fijar las calorías">
          {(
            [
              ['calculated', 'Calcular (recomendado)'],
              ['manual', 'Fijar yo'],
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
          <>
            <Calculator profile={goals.profile ?? {}} onChange={(profile) => update({ ...goals, profile })} measured={goals.measuredTdee} />
            {goals.measuredTdee && (
              <p className="hint measured">
                Tu gasto viene de tus propias semanas en Progreso, no de la fórmula.{' '}
                <button className="link-btn" onClick={() => update({ ...goals, measuredTdee: undefined })}>
                  Volver a la fórmula
                </button>
              </p>
            )}
          </>
        )}
      </section>

      <section className="card pad">
        <h2 className="section-title">Reparto de macros</h2>
        <p className="hint">Qué parte de tus calorías viene de cada macro. Carbohidratos y proteínas tienen 4 kcal por gramo; las grasas, 9.</p>
        {mode === 'calculated' && isComplete(goals.profile) && (
          <ProteinByWeight goals={goals} profile={goals.profile} onChange={(perKg, custom) => update({ ...goals, proteinPerKg: perKg, proteinCustom: custom })} />
        )}
        {!goals.proteinPerKg && (
        <div className="presets">
          {PRESETS.map((p) => {
            const active = MACROS.every((m) => p.split[m] === goals.split[m])
            return (
              <button key={p.name} type="button" className={`preset ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => update({ ...goals, split: p.split })}>
                <span className="preset-name">{p.name}</span>
                <span className="preset-split">
                  {MACROS.map((m) => (
                    <span key={m} className={`macro-${m}`}>
                      {MACRO_SHORT[m]} {p.split[m]}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        )}
        {/* Moving the split by hand means choosing percentages, so protein stops following weight. */}
        <SplitEditor split={goals.split} kcal={goals.kcal} onChange={(split) => update({ ...goals, split, proteinPerKg: 0 })} />
      </section>
    </div>
  )
}

/** Which meals the day has: some people skip merienda, others eat five times. */
function MealsCard() {
  const meals = useMeals()
  function toggle(meal: Meal) {
    const next = meals.includes(meal) ? meals.filter((m) => m !== meal) : [...meals, meal]
    if (next.length) saveMeals(next)
  }
  return (
    <section className="card pad">
      <h2 className="section-title">Comidas del día</h2>
      <p className="hint">Elige las que haces. Aparecen en Diario, en Plan y en el texto para importar planes. Lo ya apuntado no se pierde.</p>
      <div className="meal-toggles">
        {MEALS.map((m) => {
          const on = meals.includes(m)
          return (
            <label key={m} className={`meal-toggle ${on ? 'on' : ''}`}>
              <input type="checkbox" checked={on} disabled={on && meals.length === 1} onChange={() => toggle(m)} />
              <span>{MEAL_LABEL[m]}</span>
            </label>
          )
        })}
      </div>
    </section>
  )
}

/** Protein in grams per kilo of body weight, with fat around 30 % and carbs taking the rest. */
function ProteinByWeight({ goals, profile, onChange }: { goals: GoalsT; profile: Profile; onChange: (perKg: number, custom: boolean) => void }) {
  const on = !!goals.proteinPerKg
  const perKg = goals.proteinPerKg || defaultProteinPerKg(profile.adjustment)
  const ref = referenceWeight(profile)
  // Same figure as the protein row below, which comes from the rounded split.
  const grams = Math.round(goalGrams(goals).protein)
  const step = (delta: number) => onChange(Math.round(Math.min(MAX_PER_KG, Math.max(MIN_PER_KG, perKg + delta)) * 10) / 10, true)
  return (
    <div className={`protein-kg ${on ? 'on' : ''}`}>
      <label className="check-row">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? defaultProteinPerKg(profile.adjustment) : 0, false)} />
        <span>
          <strong>Proteína según tu peso</strong> (recomendado)
        </span>
      </label>
      {on && (
        <>
          <div className="protein-kg-row">
            <div className="stepper">
              <button type="button" className="step-btn" aria-label="Menos proteína" onClick={() => step(-0.1)}>
                −
              </button>
              <span className="protein-kg-value">{num(perKg)} g/kg</span>
              <button type="button" className="step-btn" aria-label="Más proteína" onClick={() => step(0.1)}>
                +
              </button>
            </div>
            <span className="protein-kg-grams">
              <strong>{grams} g</strong> de proteína al día
            </span>
          </div>
          <p className="hint">
            {profile.adjustment < 0 ? 'Para perder peso se suelen recomendar 1,6–2,2 g por kg: ayuda a conservar músculo. ' : 'Entre 1,6 y 2 g por kg es lo habitual si entrenas. '}
            Las grasas se quedan en torno al 30 % y los carbohidratos completan el resto.
            {ref.adjusted && ` Con tu peso se calcula sobre ${ref.kg} kg (el peso con un IMC de 25), porque sobre el peso real saldría una cantidad poco realista.`}
          </p>
          <p className="hint">Si tienes problemas de riñón, consulta con un profesional antes de seguir una dieta alta en proteína.</p>
        </>
      )}
    </div>
  )
}

// Units go in the label: three fields share a phone-width row, too narrow for a suffix inside each box.
const NUM_FIELDS = [
  ['age', 'Edad (años)'],
  ['heightCm', 'Altura (cm)'],
  ['weightKg', 'Peso (kg)'],
] as const

function Calculator({ profile, onChange, measured }: { profile: Partial<Profile>; onChange: (p: Partial<Profile>) => void; measured?: number }) {
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
        {NUM_FIELDS.map(([key, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              inputMode="decimal"
              value={texts[key]}
              onChange={(e) => {
                setTexts({ ...texts, [key]: e.target.value })
                const v = parseNum(e.target.value)
                set({ [key]: Number.isFinite(v) ? v : undefined })
              }}
            />
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
        <Breakdown profile={p} measured={measured} />
      ) : (
        <p className="hint result-empty">Completa sexo, edad, altura, peso y actividad para calcular tus calorías.</p>
      )}
    </div>
  )
}

function Breakdown({ profile, measured }: { profile: Profile; measured?: number }) {
  const basal = bmr(profile)
  const burn = measured ?? tdee(profile)
  const target = Math.round(burn + profile.adjustment)
  return (
    <div className="breakdown" aria-live="polite">
      <div className="breakdown-row">
        <span>Metabolismo basal</span>
        <strong>{kcal(basal)} kcal</strong>
      </div>
      <div className="breakdown-row">
        <span>{measured ? 'Gasto diario (medido con tus datos)' : `Gasto diario (× ${activityFactor(profile).toLocaleString(LOCALE)} por actividad)`}</span>
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

/** Lines of a list, as in the old Alimentos tab. */
function FoodsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
}
