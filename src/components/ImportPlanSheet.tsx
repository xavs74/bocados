import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { MEALS, MEAL_LABEL, db, type Food, type Meal } from '../db'
import { useGoals } from '../hooks'
import { addDays, weekdayName } from '../lib/dates'
import { grams as gramsText, kcal, parseNum } from '../lib/format'
import { scale } from '../lib/nutrition'
import { buildPrompt, extractJson, foodNamesForPrompt, matchFood, parsePlan } from '../lib/planImport'
import { clearPlannedWeek, planItems } from '../lib/plan'
import { PickFoodSheet } from './PickFoodSheet'
import { Sheet } from './Sheet'

function DayTotal({ kcalTotal, goal, claimed }: { kcalTotal: number; goal: number; claimed?: number }) {
  const off = goal > 0 && Math.abs(kcalTotal - goal) / goal > 0.15
  return (
    <p className={`import-day-total ${off ? 'off' : 'muted'}`}>
      {kcal(kcalTotal)} kcal · objetivo {kcal(goal)}
      {claimed ? <span className="muted"> · el plan decía {kcal(claimed)}</span> : null}
    </p>
  )
}

/** One line of the plan once it has been matched against the food list. */
interface Row {
  key: string
  dayIndex: number
  meal: Meal
  text: string
  grams: number
  food: Food | null
  skip: boolean
}

type Step = 'prompt' | 'paste' | 'review'

export function ImportPlanSheet({ weekStart, onClose }: { weekStart: string; onClose: () => void }) {
  const goals = useGoals()
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const [step, setStep] = useState<Step>('prompt')
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  // What the assistant said each day added up to, to compare with our own numbers.
  const [claims, setClaims] = useState<Record<number, number | undefined>>({})
  const [replace, setReplace] = useState(true)
  const [picking, setPicking] = useState<string | null>(null)

  const prompt = useMemo(() => buildPrompt(goals, { days: 7, notes, foodNames: foodNamesForPrompt(foods ?? []) }), [goals, notes, foods])
  const kept = rows.filter((r) => r.food && !r.skip)
  const unmatched = rows.filter((r) => !r.food && !r.skip)

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setStep('paste')
  }

  function read() {
    const json = extractJson(answer)
    if (!json) {
      setError('No he encontrado el plan en ese texto. Pega la respuesta entera, tal cual.')
      return
    }
    const plan = parsePlan(json)
    if (!plan.days.length) {
      setError(plan.issues[0] ?? 'Esa respuesta no tiene días de plan.')
      return
    }
    const list: Row[] = []
    setClaims(Object.fromEntries(plan.days.map((d) => [d.index, d.claimedKcal])))
    plan.days.forEach((day) => {
      MEALS.forEach((meal) => {
        day.meals[meal].forEach((item, i) => {
          const match = matchFood(item.name, foods ?? [])
          list.push({ key: `${day.index}-${meal}-${i}`, dayIndex: day.index, meal, text: item.name, grams: item.grams, food: match?.food ?? null, skip: false })
        })
      })
    })
    setRows(list)
    setIssues(plan.issues)
    setError(null)
    setStep('review')
  }

  async function apply() {
    if (replace) await clearPlannedWeek(weekStart)
    for (const day of new Set(kept.map((r) => r.dayIndex))) {
      for (const meal of MEALS) {
        const items = kept.filter((r) => r.dayIndex === day && r.meal === meal)
        if (!items.length) continue
        await planItems(
          items.map((r) => ({
            foodId: r.food!.id,
            name: r.food!.name,
            per100: { kcal: r.food!.kcal, carbs: r.food!.carbs, protein: r.food!.protein, fat: r.food!.fat },
            grams: r.grams,
            amount: { quantity: r.grams },
          })),
          addDays(weekStart, day),
          meal,
        )
      }
    }
    onClose()
  }

  if (picking) {
    const row = rows.find((r) => r.key === picking)!
    return (
      <PickFoodSheet
        title={`¿Qué es "${row.text}"?`}
        confirmLabel="Usar este alimento"
        context={`Del plan: ${row.text} · ${gramsText(row.grams)} · ${weekdayName(addDays(weekStart, row.dayIndex))}, ${MEAL_LABEL[row.meal].toLowerCase()}`}
        initialQuery={row.text}
        initialGrams={row.grams}
        onClose={() => setPicking(null)}
        onPick={(food, _amount, grams) => {
          setRows(rows.map((r) => (r.key === picking ? { ...r, food, grams } : r)))
          setPicking(null)
        }}
      />
    )
  }

  if (step === 'prompt') {
    return (
      <Sheet
        title="Importar un plan"
        onClose={onClose}
        footer={
          <div className="footer-row">
            <button className="btn ghost" onClick={() => setStep('paste')}>
              Ya lo tengo
            </button>
            <button className="btn primary grow" onClick={copyPrompt}>
              {copied ? '✓ Copiado' : 'Copiar el texto'}
            </button>
          </div>
        }
      >
        <div className="import">
          <p className="hint">
            Copia este texto, pégalo en ChatGPT, Claude o el asistente que uses, y vuelve con su respuesta. Ya lleva tus objetivos; las calorías las calcula Bocados con sus
            propios datos.
          </p>
          <label className="field">
            <span>¿Algo que tener en cuenta? (opcional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="sin lactosa, cocino solo los domingos…" />
          </label>
          <pre className="prompt-box">{prompt}</pre>
        </div>
      </Sheet>
    )
  }

  if (step === 'paste') {
    return (
      <Sheet
        title="Pega la respuesta"
        onClose={onClose}
        footer={
          <div className="footer-row">
            <button className="btn ghost" onClick={() => setStep('prompt')}>
              Atrás
            </button>
            <button className="btn primary grow" onClick={read} disabled={answer.trim().length < 10}>
              Ver qué ha entendido
            </button>
          </div>
        }
      >
        <div className="import">
          <p className="hint">Pega la respuesta entera. Da igual si trae texto alrededor.</p>
          <textarea className="paste-box" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Pega aquí lo que te ha contestado" autoFocus />
          {error && <p className="hint warn">{error}</p>}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      title="Revisa el plan"
      onClose={onClose}
      footer={
        <div className="footer-row">
          <button className="btn ghost" onClick={() => setStep('paste')}>
            Atrás
          </button>
          <button className="btn primary grow" onClick={apply} disabled={kept.length === 0}>
            Añadir {kept.length} al plan
          </button>
        </div>
      }
    >
      <div className="import">
        <p className="hint">
          {kept.length} de {rows.length} alimentos reconocidos
          {unmatched.length > 0 && `, ${unmatched.length} por resolver`}. Las calorías son las de tu base de datos, no las del plan.
        </p>
        <label className="check-row">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          <span>Reemplazar lo que ya hay planificado esta semana</span>
        </label>
        {issues.length > 0 && (
          <details className="import-issues">
            <summary>{issues.length} cosas que no he podido leer</summary>
            <ul>
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        )}

        {[...new Set(rows.map((r) => r.dayIndex))].sort().map((dayIndex) => (
          <section key={dayIndex}>
            <h3 className="group-title">{weekdayName(addDays(weekStart, dayIndex))}</h3>
            <ul className="import-list">
              {rows
                .filter((r) => r.dayIndex === dayIndex)
                .map((row) => (
                  <li key={row.key} className={row.skip ? 'skipped' : row.food ? '' : 'unmatched'}>
                    <div className="import-main">
                      <span className="import-meal muted">{MEAL_LABEL[row.meal]}</span>
                      <span className="import-name">{row.food ? row.food.name : row.text}</span>
                      {row.food && row.food.name.toLowerCase() !== row.text.toLowerCase() && <span className="import-from muted">del plan: {row.text}</span>}
                    </div>
                    <div className="import-amount">
                      <input
                        inputMode="numeric"
                        value={row.grams}
                        aria-label={`Gramos de ${row.text}`}
                        onChange={(e) => {
                          const grams = parseNum(e.target.value)
                          setRows(rows.map((r) => (r.key === row.key ? { ...r, grams: Number.isFinite(grams) ? grams : 0 } : r)))
                        }}
                      />
                      <span className="muted">g</span>
                    </div>
                    <span className="import-kcal muted">{row.food ? kcal(scale(row.food, row.grams).kcal) : '—'}</span>
                    <button className="btn ghost small" onClick={() => setPicking(row.key)}>
                      {row.food ? 'Cambiar' : 'Buscar'}
                    </button>
                    <button className="icon-btn" aria-label={row.skip ? `Recuperar ${row.text}` : `Quitar ${row.text}`} onClick={() => setRows(rows.map((r) => (r.key === row.key ? { ...r, skip: !r.skip } : r)))}>
                      {row.skip ? '↺' : '×'}
                    </button>
                  </li>
                ))}
            </ul>
            <DayTotal
              kcalTotal={rows.filter((r) => r.dayIndex === dayIndex && r.food && !r.skip).reduce((sum, r) => sum + scale(r.food!, r.grams).kcal, 0)}
              goal={goals.kcal}
              claimed={claims[dayIndex]}
            />
          </section>
        ))}
        <p className="hint">
          Si algún día se pasa mucho, suele ser porque el plan da pesos ya cocinados: el arroz, la pasta y las legumbres pesan el triple cocidos que crudos. Ajusta los gramos
          aquí o pide el plan otra vez.
        </p>
      </div>
    </Sheet>
  )
}
