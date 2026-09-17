import { useState } from 'react'
import { db, type Food, type Serving } from '../db'
import { CATEGORIES, OWN_CATEGORY } from '../lib/categories'
import { inputNum, kcal, parseNum } from '../lib/format'
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
  ['kcal', 'Energía', 'kcal'],
  ['carbs', 'Carbohidratos', 'g'],
  ['protein', 'Proteínas', 'g'],
  ['fat', 'Grasas', 'g'],
] as const

type NumKey = (typeof FIELDS)[number][0]

const toText = (n: number | undefined) => (n === undefined ? '' : inputNum(n))
const parse = parseNum
const valid = (s: string) => Number.isFinite(parse(s)) && parse(s) >= 0

export function FoodForm({ food, initialName = '', onClose, onSaved, onDelete }: Props) {
  const [name, setName] = useState(food?.name ?? initialName)
  const [category, setCategory] = useState(food?.category ?? '')
  const [values, setValues] = useState<Record<NumKey, string>>({
    kcal: toText(food?.kcal),
    carbs: toText(food?.carbs),
    protein: toText(food?.protein),
    fat: toText(food?.fat),
  })
  const [servings, setServings] = useState<{ label: string; grams: string }[]>(
    (food?.servings ?? []).map((s) => ({ label: s.label, grams: inputNum(s.grams) })),
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
    const data = { name: name.trim(), ...nutrients, servings: cleanServings, category: category || undefined }
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
      title={food ? 'Editar alimento' : 'Nuevo alimento'}
      onClose={onClose}
      footer={
        <div className="footer-row">
          {onDelete && (
            <button className="btn danger ghost" onClick={onDelete}>
              Borrar
            </button>
          )}
          <button type="submit" form="food-form" className="btn primary grow">
            {food ? 'Guardar cambios' : 'Crear alimento'}
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
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!food} aria-invalid={touched && !name.trim()} placeholder="p. ej. Yogur griego 0 %" />
        </label>

        <label className="field">
          <span>Categoría</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{OWN_CATEGORY}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="fieldset">
          <legend>Por cada 100 g</legend>
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
              Los macros suman unas {kcal(fromMacros)} kcal, no {kcal(nutrients.kcal)}. Revisa la etiqueta.
            </p>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend>Raciones</legend>
          <p className="hint">Opcional. Así puedes apuntar «1 loncha» en vez de pesarla.</p>
          {servings.map((s, i) => (
            <div className="serving-row" key={i}>
              <input
                aria-label="Nombre de la ración"
                placeholder="1 loncha"
                value={s.label}
                onChange={(e) => setServings(servings.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <input
                aria-label="Gramos por ración"
                inputMode="decimal"
                placeholder="gramos"
                value={s.grams}
                onChange={(e) => setServings(servings.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))}
              />
              <span className="muted">g</span>
              <button type="button" className="icon-btn" aria-label="Quitar ración" onClick={() => setServings(servings.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost small" onClick={() => setServings([...servings, { label: '', grams: '' }])}>
            + Añadir ración
          </button>
        </fieldset>
      </form>
    </Sheet>
  )
}
