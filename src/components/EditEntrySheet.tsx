import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, gramsOf, type Entry } from '../db'
import { amountFrom, draftFrom } from '../lib/amount'
import { AmountEditor } from './AmountEditor'
import { MealPicker } from './MealPicker'
import { Sheet } from './Sheet'

export function EditEntrySheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  // Offer the food's current servings, falling back to the one the entry was logged with.
  // undefined while loading, null if the food has since been deleted.
  const food = useLiveQuery(() => db.foods.get(entry.foodId).then((f) => f ?? null), [entry.foodId])
  if (food === undefined) return null
  const servings = food?.servings ?? (entry.amount.serving ? [entry.amount.serving] : [])
  return <EditEntryForm entry={entry} servings={servings} onClose={onClose} />
}

function EditEntryForm({ entry, servings, onClose }: { entry: Entry; servings: NonNullable<Entry['amount']['serving']>[]; onClose: () => void }) {
  const [draft, setDraft] = useState(() => draftFrom(entry.amount, servings))
  const [meal, setMeal] = useState(entry.meal)
  const amount = amountFrom(draft, servings)

  async function save() {
    if (!amount) return
    await db.entries.update(entry.id, { amount, grams: gramsOf(amount), meal })
    onClose()
  }

  async function remove() {
    await db.entries.delete(entry.id)
    onClose()
  }

  return (
    <Sheet
      title={entry.name}
      onClose={onClose}
      footer={
        <div className="footer-row">
          <button className="btn danger ghost" onClick={remove}>
            Remove
          </button>
          <button type="submit" form="edit-entry" className="btn primary grow" disabled={!amount}>
            Save
          </button>
        </div>
      }
    >
      <form
        id="edit-entry"
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <AmountEditor draft={draft} onChange={setDraft} servings={servings} per100={entry.per100} autoFocus />
        <MealPicker value={meal} onChange={setMeal} />
      </form>
    </Sheet>
  )
}
