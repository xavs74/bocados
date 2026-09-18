import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { MEALS, MEAL_LABEL, db, type Food, type Meal } from '../db'
import { useGoalsState, useMeals } from '../hooks'
import { addDays, weekdayName } from '../lib/dates'
import { grams as gramsText, kcal, num, parseNum } from '../lib/format'
import { scale } from '../lib/nutrition'
import { buildPrompt, extractJson, findRecipes, foodNamesForPrompt, matchFood, parsePlan, type RecipeHit } from '../lib/planImport'
import { servingGrams } from '../lib/recipes'
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
  // The prompt carries the goals, so it waits for them: built from the defaults
  // while they load, a quick "Copiar" sent 1.700 kcal instead of the real goal.
  const { goals, set: goalsSet, loaded: goalsLoaded } = useGoalsState()
  const meals = useMeals()
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const recipes = useLiveQuery(() => db.recipes.toArray(), [])
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

  const prompt = useMemo(
    () =>
      buildPrompt(goals, {
        days: 7,
        notes,
        foodNames: foodNamesForPrompt(foods ?? []),
        recipes: (recipes ?? []).map((r) => ({ name: r.name, servingGrams: servingGrams(r.ingredients, r.servings) })),
        meals,
      }),
    [goals, notes, foods, recipes, meals],
  )
  const ready = goalsLoaded && foods !== undefined && recipes !== undefined
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

  /** Rows in the same meal that ended up as the same food, usually a matching mistake. */
  const duplicates = useMemo(() => {
    const seen = new Map<string, number>()
    for (const r of rows) if (r.food && !r.skip) seen.set(`${r.dayIndex}-${r.meal}-${r.food.id}`, (seen.get(`${r.dayIndex}-${r.meal}-${r.food.id}`) ?? 0) + 1)
    return new Set(rows.filter((r) => r.food && !r.skip && (seen.get(`${r.dayIndex}-${r.meal}-${r.food.id}`) ?? 0) > 1).map((r) => r.key))
  }, [rows])

  /** Meals whose foods add up to one of this person's recipes. */
  function recipeHits(dayIndex: number): { meal: Meal; hit: RecipeHit }[] {
    return MEALS.flatMap((meal) =>
      findRecipes(
        rows.filter((r) => r.dayIndex === dayIndex && r.meal === meal && !r.skip).map((r) => ({ key: r.key, foodId: r.food?.id, grams: r.grams })),
        recipes ?? [],
      ).map((hit) => ({ meal, hit })),
    )
  }

  /** Swaps the ingredient rows for the recipe itself, keeping their weight. */
  function swapInRecipe(dayIndex: number, meal: Meal, hit: RecipeHit) {
    const food = foods?.find((f) => f.id === hit.recipe.foodId)
    if (!food) return
    const first = rows.findIndex((r) => hit.keys.includes(r.key))
    const merged: Row = { key: `${dayIndex}-${meal}-receta-${hit.recipe.id}`, dayIndex, meal, text: hit.recipe.name, grams: Math.round(hit.grams), food, skip: false }
    const rest = rows.filter((r) => !hit.keys.includes(r.key))
    rest.splice(Math.min(first, rest.length), 0, merged)
    setRows(rest)
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
            <button className="btn primary grow" onClick={copyPrompt} disabled={!ready || !goalsSet}>
              {!ready ? 'Preparando…' : copied ? '✓ Copiado' : 'Copiar el texto'}
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
          {ready && !goalsSet ? (
            <div className="no-goal-banner">
              <p>
                <strong>Primero necesitas un objetivo.</strong> El texto lleva tus calorías y macros; sin ellos, el plan no estaría hecho para ti.
              </p>
              <a className="btn primary small" href="#/goals" onClick={onClose}>
                Ir a Objetivos
              </a>
            </div>
          ) : (
            <pre className="prompt-box">{ready ? prompt : 'Cargando tus objetivos…'}</pre>
          )}
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
            {recipeHits(dayIndex).map(({ meal, hit }) => (
              <div className="recipe-hint" key={`${meal}-${hit.recipe.id}`}>
                <span>
                  {MEAL_LABEL[meal]}: parece tu receta <strong>{hit.recipe.name}</strong> (≈ {num(hit.grams / Math.max(servingGrams(hit.recipe.ingredients, hit.recipe.servings), 1))}{' '}
                  raciones)
                </span>
                <button className="btn ghost small" onClick={() => swapInRecipe(dayIndex, meal, hit)}>
                  Usar la receta
                </button>
              </div>
            ))}
            <ul className="import-list">
              {rows
                .filter((r) => r.dayIndex === dayIndex)
                .map((row) => (
                  <li key={row.key} className={row.skip ? 'skipped' : !row.food ? 'unmatched' : duplicates.has(row.key) ? 'duplicate' : ''}>
                    <div className="import-main">
                      <span className="import-meal muted">{MEAL_LABEL[row.meal]}</span>
                      <span className="import-name">{row.food ? row.food.name : row.text}</span>
                      {row.food && row.food.name.toLowerCase() !== row.text.toLowerCase() && <span className="import-from muted">del plan: {row.text}</span>}
                      {duplicates.has(row.key) && <span className="import-dup">Repetido en esta comida: revisa si es el alimento correcto</span>}
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
