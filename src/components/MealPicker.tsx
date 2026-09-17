import { MEALS, MEAL_LABEL, type Meal } from '../db'

export function MealPicker({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Comida del día">
      {MEALS.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          className={value === m ? 'active' : ''}
          onClick={() => onChange(m)}
        >
          {MEAL_LABEL[m]}
        </button>
      ))}
    </div>
  )
}
