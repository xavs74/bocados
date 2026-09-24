import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { MEAL_LABEL, db, gramsOf, type Amount, type Food, type Meal } from '../db'
import { amountFrom, draftFrom, type AmountDraft } from '../lib/amount'
import { categoryOf } from '../lib/categories'
import { grams, kcal, matches, num } from '../lib/format'
import { ESTIMATE, saveDish, searchDishes, type Dish } from '../lib/eatingOut'
import { usualFoods, usualFrom, type UsualFood } from '../lib/usual'
import { MIN_QUERY, productLabel, saveProduct, searchProducts, type Product } from '../lib/openFoodFacts'
import { AmountEditor } from './AmountEditor'
import { FoodForm } from './FoodForm'
import { MealPicker } from './MealPicker'
import { Panel } from './Panel'
import { ScanSheet } from './ScanSheet'
import { Sheet } from './Sheet'

async function logFood(date: string, meal: Meal, food: Food, amount: NonNullable<ReturnType<typeof amountFrom>>) {
  const now = Date.now()
  await db.transaction('rw', db.entries, db.foods, async () => {
    await db.entries.add({
      date,
      meal,
      foodId: food.id,
      name: food.name,
      per100: { kcal: food.kcal, carbs: food.carbs, protein: food.protein, fat: food.fat },
      grams: gramsOf(amount),
      amount,
      createdAt: now,
    } as never)
    await db.foods.update(food.id, { lastUsed: now, lastAmount: amount })
  })
}

interface FlowProps {
  date: string
  meal: Meal
  onMealChange: (meal: Meal) => void
  /** Called after a food is logged, with a short description of it. */
  onAdded: (description: string) => void
  /** Wraps each step; receives the step's title, body and footer. */
  frame: (title: string, body: ReactNode, footer?: ReactNode) => ReactNode
  /** Docked beside the day: Escape goes back to the search instead of closing. */
  docked?: boolean
  /** Focus the search when it appears (off for the docked panel's first render). */
  autoFocus?: boolean
}

/** Search a food, then set the amount and meal. Shared by the phone sheet and the laptop panel. */
function AddEntryFlow({ date, meal, onMealChange, onAdded, frame, docked, autoFocus = true }: FlowProps) {
  const [query, setQuery] = useState('')
  const [food, setFood] = useState<Food | null>(null)
  const [draft, setDraft] = useState<AmountDraft>({ text: '', unit: -1 })
  const [creating, setCreating] = useState<{ name: string; barcode?: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const [added, setAdded] = useState<string | null>(null)

  function choose(f: Food, amount?: Amount) {
    setFood(f)
    setDraft(draftFrom(amount ?? f.lastAmount, f.servings))
  }

  async function quickAdd(f: Food, amount: Amount) {
    await logFood(date, meal, f, amount)
    setAdded(`${f.name} (${grams(gramsOf(amount))})`)
  }

  function backToSearch() {
    setFood(null)
    // Wait for the search step to render before focusing it.
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  const creatingForm = creating && (
    <FoodForm initialName={creating.name} initialBarcode={creating.barcode} onClose={() => setCreating(null)} onSaved={choose} />
  )

  const scanner = scanning && (
    <ScanSheet
      onFound={(food) => {
        setScanning(false)
        choose(food)
      }}
      onCreate={(barcode) => {
        setScanning(false)
        setCreating({ name: '', barcode })
      }}
      onClose={() => setScanning(false)}
    />
  )

  if (food) {
    const amount = amountFrom(draft, food.servings)
    const add = async () => {
      if (!amount) return
      await logFood(date, meal, food, amount)
      onAdded(`${food.name} (${grams(gramsOf(amount))}) en ${MEAL_LABEL[meal].toLowerCase()}`)
      setQuery('')
      backToSearch()
    }
    return frame(
      food.name,
      <form
        id="add-entry"
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && docked) {
            e.stopPropagation()
            backToSearch()
          }
        }}
      >
        <AmountEditor draft={draft} onChange={setDraft} servings={food.servings} per100={food} autoFocus />
        <MealPicker value={meal} onChange={onMealChange} />
      </form>,
      <div className="footer-row">
        <button type="button" className="btn ghost" onClick={backToSearch}>
          Atrás
        </button>
        <button type="submit" form="add-entry" className="btn primary grow" disabled={!amount}>
          Añadir a {MEAL_LABEL[meal].toLowerCase()}
        </button>
      </div>,
    )
  }

  return (
    <>
      {frame(
        `Añadir a ${MEAL_LABEL[meal].toLowerCase()}`,
        <>
          {added && (
            <p className="added-note" role="status">
              ✓ Añadido: {added}
            </p>
          )}
          <FoodSearch
            query={query}
            onQuery={setQuery}
            onPick={choose}
            onCreate={() => setCreating({ name: query })}
            onScan={() => setScanning(true)}
            inputRef={searchRef}
            autoFocus={autoFocus}
            usual={{ date, meal, onAdd: quickAdd }}
          />
        </>,
      )}
      {creatingForm}
      {scanner}
    </>
  )
}

export function AddEntrySheet({ date, meal: initialMeal, onClose }: { date: string; meal: Meal; onClose: () => void }) {
  const [meal, setMeal] = useState(initialMeal)
  return (
    <AddEntryFlow
      date={date}
      meal={meal}
      onMealChange={setMeal}
      onAdded={onClose}
      frame={(title, body, footer) => (
        <Sheet title={title} onClose={onClose} footer={footer}>
          {body}
        </Sheet>
      )}
    />
  )
}

interface PanelProps {
  date: string
  meal: Meal
  onMealChange: (meal: Meal) => void
  focusKey: number
}

/** Stays open beside the day on a laptop, so several foods can be logged in a row from the keyboard. */
export function AddEntryPanel({ date, meal, onMealChange, focusKey }: PanelProps) {
  const [last, setLast] = useState<string | null>(null)
  return (
    <AddEntryFlow
      date={date}
      meal={meal}
      onMealChange={onMealChange}
      onAdded={setLast}
      docked
      autoFocus={focusKey > 0}
      // A new key starts the search again, focused, whenever a meal's "Añadir" is used.
      key={focusKey}
      frame={(title, body, footer) => (
        <Panel title={title} footer={footer}>
          {last && (
            <p className="added-note" role="status">
              ✓ Añadido: {last}
            </p>
          )}
          {body}
        </Panel>
      )}
    />
  )
}

interface SearchProps {
  query: string
  onQuery: (q: string) => void
  onPick: (f: Food, amount?: Amount) => void
  onCreate: () => void
  onScan: () => void
  inputRef: RefObject<HTMLInputElement | null>
  autoFocus: boolean
  /** Shows "Lo de siempre" for this meal, with a button that logs each one straight away. */
  usual?: { date: string; meal: Meal; onAdd: (f: Food, amount: Amount) => void }
}

/** Eating out, without describing the meal: three sizes, one tap each. */
function EatingOutGuess({ onAdd }: { onAdd: (f: Food, amount: Amount) => void }) {
  return (
    <section className="eating-out" aria-label="Comí fuera">
      <h3 className="group-title">¿Comiste fuera y no sabes qué poner?</h3>
      <div className="guess-row">
        {ESTIMATE.servings.map((serving) => (
          <button
            key={serving.label}
            className="guess"
            onClick={async () => onAdd(await saveDish(ESTIMATE), { quantity: 1, serving })}
          >
            <strong>{serving.label.replace(/^1 comida /, '')}</strong>
            <span className="muted">{kcal((ESTIMATE.kcal * serving.grams) / 100)} kcal</span>
          </button>
        ))}
      </div>
      <p className="hint">Es una estimación: puedes cambiarla luego, o buscar el plato por su nombre.</p>
    </section>
  )
}

/** Typical dishes from a bar, a pizza place or a kebab, with typical portions. */
function DishResults({ dishes, onPick, action = 'Añadir' }: { dishes: Dish[]; onPick: (f: Food) => void; action?: string }) {
  if (!dishes.length) return null
  return (
    <section className="products">
      <h3 className="group-title">
        Fuera de casa <span className="muted">· valores aproximados</span>
      </h3>
      <ul className="food-list">
        {dishes.map((dish) => (
          <li key={dish.name}>
            <button className="food-row" onClick={async () => onPick(await saveDish(dish))} title={`${action}: ${dish.name}`}>
              <span className="food-name">{dish.name}</span>
              <span className="food-meta">
                {dish.servings[0] && `${dish.servings[0].label.replace(/^1\s+/, '')} · ${kcal((dish.kcal * dish.servings[0].grams) / 100)} kcal`}
                <span className="muted"> · {dish.group.toLowerCase()}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function FoodSearch({ query, onQuery, onPick, onCreate, onScan, inputRef, autoFocus, usual }: SearchProps) {
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), [])
  const usualDate = usual?.date
  const usualMeal = usual?.meal
  const history = useLiveQuery(
    () => (usualDate ? db.entries.where('date').between(usualFrom(usualDate), usualDate, true, true).toArray() : []),
    [usualDate],
  )
  const usualList = useMemo(
    () => (usualDate && usualMeal && history && foods ? usualFoods(history, usualMeal, usualDate, new Map(foods.map((f) => [f.id, f]))) : []),
    [usualDate, usualMeal, history, foods],
  )
  const [active, setActive] = useState(0)
  // Enter picks the highlighted food once there's a query or the arrows were used.
  const [navigated, setNavigated] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const { recent, rest } = useMemo(() => {
    const all = foods ?? []
    if (query.trim()) {
      const hits = all.filter((f) => matches(f.name, query))
      hits.sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
      return { recent: [], rest: hits }
    }
    const shown = new Set(usualList.map((u) => u.food.id))
    const recent = all
      .filter((f) => f.lastUsed && !shown.has(f.id))
      .sort((a, b) => b.lastUsed! - a.lastUsed!)
      .slice(0, 8)
    return { recent, rest: all }
  }, [foods, query, usualList])

  // Keyboard order: recent first, then the rest.
  const flat = useMemo(() => [...recent, ...rest], [recent, rest])
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0))

  useEffect(() => {
    listRef.current?.querySelector('.food-row.active')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <>
      <div className="search with-scan">
        <input
          ref={inputRef}
          type="search"
          placeholder="Buscar alimento"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value)
            setActive(0)
            setNavigated(false)
          }}
          autoFocus={autoFocus}
          aria-label="Buscar alimento"
          aria-controls="food-results"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setActive(navigated ? Math.max(0, Math.min(flat.length - 1, activeIndex + (e.key === 'ArrowDown' ? 1 : -1))) : 0)
              setNavigated(true)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (flat[activeIndex] && (query.trim() || navigated)) onPick(flat[activeIndex])
              else e.currentTarget.blur()
            }
          }}
        />
        <button type="button" className="scan-btn" onClick={onScan} aria-label="Escanear código de barras" title="Escanear código de barras">
          <BarcodeIcon />
        </button>
      </div>
      {foods && (
        <div className="results" id="food-results" ref={listRef}>
          <button className="create-row" onClick={onCreate}>
            <span className="plus" aria-hidden="true">
              +
            </span>
            {query.trim() ? (
              <span>
                Crear «<strong>{query.trim()}</strong>»
              </span>
            ) : (
              <span>Crear un alimento nuevo</span>
            )}
          </button>
          {usual && !query.trim() && usualList.length > 0 && (
            <UsualGroup meal={usual.meal} items={usualList} onPick={onPick} onAdd={usual.onAdd} />
          )}
          {usual && !query.trim() && <EatingOutGuess onAdd={usual.onAdd} />}
          {recent.length > 0 && <FoodGroup title="Recientes" foods={recent} offset={0} active={query.trim() || navigated ? activeIndex : -1} onPick={onPick} />}
          {rest.length > 0 ? (
            <FoodGroup
              title={query.trim() ? `${rest.length} encontrados` : 'Todos los alimentos'}
              foods={rest}
              offset={recent.length}
              active={query.trim() || navigated ? activeIndex : -1}
              showCategory
              onPick={onPick}
            />
          ) : (
            <p className="empty">Ningún alimento coincide con «{query}».</p>
          )}
          <DishResults dishes={searchDishes(query)} onPick={onPick} />
          <ProductResults query={query} onPick={onPick} />
        </div>
      )}
    </>
  )
}

/**
 * Supermarket products from Open Food Facts. Searched a moment after typing
 * stops, because their search allows only a few requests a minute.
 */
export function ProductResults({ query, onPick, action = 'Añadir' }: { query: string; onPick: (f: Food) => void; action?: string }) {
  // Holds the answer for one query; anything else on screen means it's still loading.
  const [answer, setAnswer] = useState<{ query: string; items: Product[]; failed: boolean } | null>(null)
  const q = query.trim()

  useEffect(() => {
    if (q.length < MIN_QUERY) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setAnswer({ query: q, items: await searchProducts(q, controller.signal), failed: false })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setAnswer({ query: q, items: [], failed: true })
      }
    }, 600)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  if (q.length < MIN_QUERY) return null
  const ready = answer?.query === q ? answer : null

  return (
    <section className="products">
      <h3 className="group-title">
        Supermercados <span className="muted">· Open Food Facts</span>
      </h3>
      {!ready && <p className="empty">Buscando productos…</p>}
      {ready?.failed && <p className="empty">No se pudo buscar. Inténtalo otra vez.</p>}
      {ready &&
        !ready.failed &&
        (ready.items.length === 0 ? (
          <p className="empty">Ningún producto coincide con «{q}».</p>
        ) : (
          <ul className="food-list">
            {ready.items.map((p) => (
              <li key={`${p.code}-${p.name}`}>
                <button className="food-row" onClick={async () => onPick(await saveProduct(p))} title={`${action}: ${productLabel(p)}`}>
                  <span className="food-name">{productLabel(p)}</span>
                  <span className="food-meta">
                    {kcal(p.kcal)} kcal · Carb {num(p.carbs)} · Prot {num(p.protein)} · Grasa {num(p.fat)}
                    <span className="muted"> /100 g{p.serving ? ` · ración ${num(p.serving)} g` : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}

export function BarcodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 7V5.5A2.5 2.5 0 0 1 5.5 3H7M17 3h1.5A2.5 2.5 0 0 1 21 5.5V7M21 17v1.5a2.5 2.5 0 0 1-2.5 2.5H17M7 21H5.5A2.5 2.5 0 0 1 3 18.5V17" />
      <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" strokeWidth="1.6" />
    </svg>
  )
}

function amountLabel(amount: Amount) {
  const g = grams(gramsOf(amount))
  if (!amount.serving) return g
  return `${num(amount.quantity)} × ${amount.serving.label.replace(/^1\s+/, '')} · ${g}`
}

/** What the person usually eats in this meal, each with a button that logs it as last time. */
function UsualGroup({ meal, items, onPick, onAdd }: { meal: Meal; items: UsualFood[]; onPick: (f: Food, amount: Amount) => void; onAdd: (f: Food, amount: Amount) => void }) {
  return (
    <section className="usual" aria-label="Lo de siempre">
      <h3 className="group-title">Lo de siempre en {MEAL_LABEL[meal].toLowerCase()}</h3>
      <ul className="food-list">
        {items.map(({ food, amount }) => (
          <li key={food.id} className="usual-row">
            <button className="food-row" onClick={() => onPick(food, amount)}>
              <span className="food-name">{food.name}</span>
              <span className="food-meta">
                {amountLabel(amount)} · {kcal((food.kcal * gramsOf(amount)) / 100)} kcal
              </span>
            </button>
            <button className="usual-add" onClick={() => onAdd(food, amount)} aria-label={`Añadir ${food.name}, ${amountLabel(amount)}`}>
              +
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface GroupProps {
  title: string
  foods: Food[]
  offset: number
  /** Index in the keyboard order that is highlighted, or -1. */
  active: number
  showCategory?: boolean
  onPick: (f: Food) => void
}

function FoodGroup({ title, foods, offset, active, showCategory, onPick }: GroupProps) {
  return (
    <>
      <h3 className="group-title">{title}</h3>
      <ul className="food-list">
        {foods.map((f, i) => (
          <li key={f.id}>
            <button className={`food-row ${offset + i === active ? 'active' : ''}`} onClick={() => onPick(f)}>
              <span className="food-name">{f.name}</span>
              <span className="food-meta">
                {kcal(f.kcal)} kcal · Carb {num(f.carbs)} · Prot {num(f.protein)} · Grasa {num(f.fat)}
                <span className="muted">
                  {' '}
                  /100 g{showCategory && f.category ? ` · ${categoryOf(f)}` : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
