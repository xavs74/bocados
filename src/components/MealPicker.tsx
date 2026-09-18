import { MEAL_LABEL, type Meal } from '../db'
import { useMeals } from '../hooks'
import { visibleMeals } from '../lib/meals'

export function MealPicker({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  const meals = visibleMeals(useMeals(), [value])
  return (
    <div className="segmented" role="radiogroup" aria-label="Comida del día" style={{ gridTemplateColumns: `repeat(${meals.length}, 1fr)` }}>
      {meals.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} className={value === m ? 'active' : ''} onClick={() => onChange(m)}>
          {MEAL_LABEL[m]}
        </button>
      ))}
    </div>
  )
}
