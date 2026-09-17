import { useRef, useState } from 'react'
import { gramsOf, type Amount, type Food } from '../db'
import { amountFrom, draftFrom, type AmountDraft } from '../lib/amount'
import { FoodSearch } from './AddEntry'
import { AmountEditor } from './AmountEditor'
import { FoodForm } from './FoodForm'
import { ScanSheet } from './ScanSheet'
import { Sheet } from './Sheet'

interface Props {
  title: string
  confirmLabel: string
  onPick: (food: Food, amount: Amount, grams: number) => void
  onClose: () => void
}

/** Search a food and set an amount. Used to add ingredients to a recipe. */
export function PickFoodSheet({ title, confirmLabel, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [food, setFood] = useState<Food | null>(null)
  const [draft, setDraft] = useState<AmountDraft>({ text: '', unit: -1 })
  const [creating, setCreating] = useState<{ name: string; barcode?: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  function choose(f: Food) {
    setFood(f)
    setDraft(draftFrom(f.lastAmount, f.servings))
  }

  if (creating) {
    return (
      <FoodForm
        initialName={creating.name}
        initialBarcode={creating.barcode}
        onClose={() => setCreating(null)}
        onSaved={choose}
      />
    )
  }

  if (scanning) {
    return (
      <ScanSheet
        onFound={(f) => {
          setScanning(false)
          choose(f)
        }}
        onCreate={(barcode) => {
          setScanning(false)
          setCreating({ name: '', barcode })
        }}
        onClose={() => setScanning(false)}
      />
    )
  }

  if (food) {
    const amount = amountFrom(draft, food.servings)
    const confirm = () => amount && onPick(food, amount, gramsOf(amount))
    return (
      <Sheet
        title={food.name}
        onClose={onClose}
        footer={
          <div className="footer-row">
            <button className="btn ghost" onClick={() => setFood(null)}>
              Atrás
            </button>
            <button type="submit" form="pick-food" className="btn primary grow" disabled={!amount}>
              {confirmLabel}
            </button>
          </div>
        }
      >
        <form
          id="pick-food"
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            confirm()
          }}
        >
          <AmountEditor draft={draft} onChange={setDraft} servings={food.servings} per100={food} autoFocus />
        </form>
      </Sheet>
    )
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <FoodSearch
        query={query}
        onQuery={setQuery}
        onPick={choose}
        onCreate={() => setCreating({ name: query })}
        onScan={() => setScanning(true)}
        inputRef={searchRef}
        autoFocus
      />
    </Sheet>
  )
}
