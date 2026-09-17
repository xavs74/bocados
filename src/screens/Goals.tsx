import { useRef, useState } from 'react'
import { DEFAULT_GOALS } from '../db'
import { saveGoals, useGoals } from '../hooks'
import { exportBackup, importBackup } from '../lib/backup'
import { MACROS, MACRO_LABEL, goalGrams, type Goals as GoalsT, type MacroKey } from '../lib/nutrition'

const PRESETS: { name: string; split: Record<MacroKey, number> }[] = [
  { name: 'Balanced', split: { carbs: 45, protein: 25, fat: 30 } },
  { name: 'High protein', split: { carbs: 35, protein: 35, fat: 30 } },
  { name: 'Lower carb', split: { carbs: 25, protein: 40, fat: 35 } },
]

export function Goals() {
  const saved = useGoals()
  // Unsaved edits; null means the form shows the stored goals.
  const [edit, setEdit] = useState<GoalsT | null>(null)
  const draft = edit ?? saved
  const dirty = edit !== null
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const total = MACROS.reduce((a, m) => a + draft.split[m], 0)
  const valid = draft.kcal > 0 && total === 100
  const grams = goalGrams(draft)

  function update(next: GoalsT) {
    setEdit(next)
    setMessage(null)
  }

  async function save() {
    if (!valid) return
    await saveGoals(draft)
    setEdit(null)
    setMessage('Goals saved.')
  }

  async function onImport(file: File) {
    if (!confirm('Importing replaces all foods, logged days and goals on this device. Continue?')) return
    try {
      const r = await importBackup(file)
      setEdit(null)
      setMessage(`Imported ${r.foods} foods and ${r.entries} entries.`)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  return (
    <div className="goals">
      <div className="page-head">
        <h1>Goals</h1>
      </div>

      <section className="card pad">
        <label className="field">
          <span>Daily calories</span>
          <div className="input-suffix">
            <input
              inputMode="numeric"
              value={draft.kcal || ''}
              onChange={(e) => update({ ...draft, kcal: Number(e.target.value.replace(/\D/g, '')) })}
            />
            <span>kcal</span>
          </div>
        </label>

        <h2 className="section-title">Macro split</h2>
        <p className="hint">Share of your calories from each macro. Carbs and protein have 4 kcal per gram, fat has 9.</p>

        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.name} className="btn ghost small" onClick={() => update({ ...draft, split: p.split })}>
              {p.name}
            </button>
          ))}
        </div>

        <div className="split-editor">
          {MACROS.map((m) => (
            <div className={`split-row macro-${m}`} key={m}>
              <div className="split-label">
                <span className="swatch" aria-hidden="true" />
                <span>{MACRO_LABEL[m]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={draft.split[m]}
                onChange={(e) => update({ ...draft, split: { ...draft.split, [m]: Number(e.target.value) } })}
                aria-label={`${MACRO_LABEL[m]} percent`}
              />
              <div className="input-suffix small">
                <input
                  inputMode="numeric"
                  value={draft.split[m]}
                  onChange={(e) => update({ ...draft, split: { ...draft.split, [m]: Math.min(100, Number(e.target.value.replace(/\D/g, ''))) } })}
                  aria-label={`${MACRO_LABEL[m]} percent`}
                />
                <span>%</span>
              </div>
              <div className="split-grams muted">{Math.round(grams[m])} g</div>
            </div>
          ))}
        </div>

        <div className={`split-total ${total === 100 ? 'ok' : 'bad'}`}>
          {total === 100 ? 'Adds up to 100%' : `Adds up to ${total}%. Adjust by ${Math.abs(100 - total)} to reach 100%.`}
        </div>

        <div className="footer-row">
          <button
            className="btn ghost"
            onClick={() => update(DEFAULT_GOALS)}
            title="1,700 kcal, 25 / 45 / 30"
          >
            Reset
          </button>
          <button className="btn primary grow" onClick={save} disabled={!valid || !dirty}>
            {dirty ? 'Save goals' : 'Saved'}
          </button>
        </div>
        {message && (
          <p className="hint" role="status">
            {message}
          </p>
        )}
      </section>

      <section className="card pad">
        <h2 className="section-title">Your data</h2>
        <p className="hint">
          Everything is stored on this device only. Export a backup to keep it safe or to move it to another phone or computer, then import it there.
        </p>
        <div className="footer-row">
          <button className="btn ghost grow" onClick={exportBackup}>
            Export backup
          </button>
          <button className="btn ghost grow" onClick={() => fileRef.current?.click()}>
            Import backup
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
      </section>
    </div>
  )
}
