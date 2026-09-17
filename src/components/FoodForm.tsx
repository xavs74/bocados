import { useState } from 'react'
import { db, type Food, type Serving } from '../db'
import { kcal } from '../lib/format'
import { kcalLooksWrong, macroKcal } from '../lib/nutrition'
import { Sheet } from './Sheet'

interface Props {
  food?: Food
  initialName?: string
  onClose: () => void
  onSaved?: (food: Food) => void
  onDelete?: () => void
}

const FIELDS = [
  ['kcal', 'Energy', 'kcal'],
  ['carbs', 'Carbs', 'g'],
  ['protein', 'Protein', 'g'],
  ['fat', 'Fat', 'g'],
] as const

type NumKey = (typeof FIELDS)[number][0]

const toText = (n: number | undefined) => (n === undefined ? '' : String(n))
const parse = (s: string) => Number(s.replace(',', '.'))
const valid = (s: string) => s.trim() !== '' && Number.isFinite(parse(s)) && parse(s) >= 0

export function FoodForm({ food, initialName = '', onClose, onSaved, onDelete }: Props) {
  const [name, setName] = useState(food?.name ?? initialName)
  const [values, setValues] = useState<Record<NumKey, string>>({
    kcal: toText(food?.kcal),
    carbs: toText(food?.carbs),
    protein: toText(food?.protein),
    fat: toText(food?.fat),
  })
  const [servings, setServings] = useState<{ label: string; grams: string }[]>(
    (food?.servings ?? []).map((s) => ({ label: s.label, grams: String(s.grams) })),
  )
  const [touched, setTouched] = useState(false)

  const allValid = name.trim() !== '' && FIELDS.every(([k]) => valid(values[k]))
  const cleanServings: Serving[] = servings
    .filter((s) => s.label.trim() && valid(s.grams) && parse(s.grams) > 0)
    .map((s) => ({ label: s.label.trim(), grams: parse(s.grams) }))
  const nutrients = allValid
    ? { kcal: parse(values.kcal), carbs: parse(values.carbs), protein: parse(values.protein), fat: parse(values.fat) }
    : null
  const suspicious = nutrients && kcalLooksWrong(nutrients)
  const fromMacros = nutrients ? Object.values(macroKcal(nutrients)).reduce((a, b) => a + b, 0) : 0

  async function save() {
    setTouched(true)
    if (!nutrients) return
    const data = { name: name.trim(), ...nutrients, servings: cleanServings }
    if (food) {
      await db.foods.update(food.id, data)
      onSaved?.({ ...food, ...data })
    } else {
      const id = await db.foods.add(data as Food)
      onSaved?.({ ...data, id } as Food)
    }
    onClose()
  }

  return (
    <Sheet
      title={food ? 'Edit food' : 'New food'}
      onClose={onClose}
      footer={
        <div className="footer-row">
          {onDelete && (
            <button className="btn danger ghost" onClick={onDelete}>
              Delete
            </button>
          )}
          <button type="submit" form="food-form" className="btn primary grow">
            {food ? 'Save changes' : 'Add food'}
          </button>
        </div>
      }
    >
      <form
        id="food-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!food} aria-invalid={touched && !name.trim()} placeholder="e.g. Greek yogurt 0%" />
        </label>

        <fieldset className="fieldset">
          <legend>Per 100 g</legend>
          <div className="grid-2">
            {FIELDS.map(([key, label, unit]) => (
              <label className="field" key={key}>
                <span>
                  {label} <span className="muted">({unit})</span>
                </span>
                <input
                  inputMode="decimal"
                  value={values[key]}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  aria-invalid={touched && !valid(values[key])}
                />
              </label>
            ))}
          </div>
          {suspicious && (
            <p className="hint warn">
              The macros add up to about {kcal(fromMacros)} kcal, not {kcal(nutrients.kcal)}. Worth checking the label.
            </p>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend>Servings</legend>
          <p className="hint">Optional. Lets you log "1 slice" instead of weighing it.</p>
          {servings.map((s, i) => (
            <div className="serving-row" key={i}>
              <input
                aria-label="Serving name"
                placeholder="1 slice"
                value={s.label}
                onChange={(e) => setServings(servings.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <input
                aria-label="Grams per serving"
                inputMode="decimal"
                placeholder="grams"
                value={s.grams}
                onChange={(e) => setServings(servings.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))}
              />
              <span className="muted">g</span>
              <button type="button" className="icon-btn" aria-label="Remove serving" onClick={() => setServings(servings.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost small" onClick={() => setServings([...servings, { label: '', grams: '' }])}>
            + Add serving
          </button>
        </fieldset>
      </form>
    </Sheet>
  )
}
