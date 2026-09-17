import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { MEAL_LABEL, db, gramsOf, type Food, type Meal } from '../db'
import { kcal, matches, num } from '../lib/format'
import { amountFrom, draftFrom, type AmountDraft } from '../lib/amount'
import { AmountEditor } from './AmountEditor'
import { FoodForm } from './FoodForm'
import { MealPicker } from './MealPicker'
import { Sheet } from './Sheet'

interface Props {
  date: string
  meal: Meal
  onClose: () => void
}

export function AddEntrySheet({ date, meal: initialMeal, onClose }: Props) {
  const [meal, setMeal] = useState(initialMeal)
  const [query, setQuery] = useState('')
  const [food, setFood] = useState<Food | null>(null)
  const [draft, setDraft] = useState<AmountDraft>({ text: '', unit: -1 })
  const [creating, setCreating] = useState(false)

  function choose(f: Food) {
    setFood(f)
    setDraft(draftFrom(f.lastAmount, f.servings))
  }

  if (creating) {
    return <FoodForm initialName={query} onClose={() => setCreating(false)} onSaved={choose} />
  }

  if (food) {
    const amount = amountFrom(draft, food.servings)
    async function add() {
      if (!food || !amount) return
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
      onClose()
    }
    return (
      <Sheet
        title={food.name}
        onClose={onClose}
        footer={
          <div className="footer-row">
            <button className="btn ghost" onClick={() => setFood(null)}>
              Back
            </button>
            <button type="submit" form="add-entry" className="btn primary grow" disabled={!amount}>
              Add to {MEAL_LABEL[meal].toLowerCase()}
            </button>
          </div>
        }
      >
        <form
          id="add-entry"
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <AmountEditor draft={draft} onChange={setDraft} servings={food.servings} per100={food} autoFocus />
          <MealPicker value={meal} onChange={setMeal} />
        </form>
      </Sheet>
    )
  }

  return (
    <Sheet title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`} onClose={onClose}>
      <div className="search">
        <input
          type="search"
          placeholder="Search foods"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label="Search foods"
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </div>
      <FoodResults query={query} onPick={choose} onCreate={() => setCreating(true)} />
    </Sheet>
  )
}

function FoodResults({ query, onPick, onCreate }: { query: string; onPick: (f: Food) => void; onCreate: () => void }) {
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), [])

  const { recent, rest } = useMemo(() => {
    const all = foods ?? []
    if (query.trim()) {
      const hits = all.filter((f) => matches(f.name, query))
      hits.sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
      return { recent: [], rest: hits }
    }
    const recent = all
      .filter((f) => f.lastUsed)
      .sort((a, b) => b.lastUsed! - a.lastUsed!)
      .slice(0, 8)
    return { recent, rest: all }
  }, [foods, query])

  if (!foods) return null

  return (
    <div className="results">
      <button className="create-row" onClick={onCreate}>
        <span className="plus" aria-hidden="true">+</span>
        {query.trim() ? (
          <span>
            Create “<strong>{query.trim()}</strong>”
          </span>
        ) : (
          <span>Create a new food</span>
        )}
      </button>
      {recent.length > 0 && <FoodGroup title="Recent" foods={recent} onPick={onPick} />}
      {rest.length > 0 ? (
        <FoodGroup title={query.trim() ? `${rest.length} found` : 'All foods'} foods={rest} onPick={onPick} />
      ) : (
        <p className="empty">No foods match “{query}”.</p>
      )}
    </div>
  )
}

function FoodGroup({ title, foods, onPick }: { title: string; foods: Food[]; onPick: (f: Food) => void }) {
  return (
    <>
      <h3 className="group-title">{title}</h3>
      <ul className="food-list">
        {foods.map((f) => (
          <li key={f.id}>
            <button className="food-row" onClick={() => onPick(f)}>
              <span className="food-name">{f.name}</span>
              <span className="food-meta">
                {kcal(f.kcal)} kcal · C {num(f.carbs)} · P {num(f.protein)} · F {num(f.fat)}
                <span className="muted"> /100 g</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
