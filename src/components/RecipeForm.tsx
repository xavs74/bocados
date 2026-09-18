import { useState } from 'react'
import { type Ingredient, type Recipe } from '../db'
import { grams as gramsText, inputNum, kcal, num, parseNum } from '../lib/format'
import { MACROS, MACRO_LABEL } from '../lib/nutrition'
import { deleteRecipe, perServing, recipeTotals, saveRecipe, servingGrams, totalGrams } from '../lib/recipes'
import { PickFoodSheet } from './PickFoodSheet'
import { Sheet } from './Sheet'
import { askConfirm } from '../lib/confirm'

interface Props {
  recipe?: Recipe
  onClose: () => void
}

/** Builds a dish from foods and says how many servings it makes. */
export function RecipeForm({ recipe, onClose }: Props) {
  const [name, setName] = useState(recipe?.name ?? '')
  const [servingsText, setServingsText] = useState(recipe ? inputNum(recipe.servings) : '4')
  const [ingredients, setIngredients] = useState<Ingredient[]>(recipe?.ingredients ?? [])
  const [adding, setAdding] = useState(false)
  const [touched, setTouched] = useState(false)

  const servings = Math.max(Math.round(parseNum(servingsText)) || 0, 0)
  const valid = name.trim() !== '' && servings > 0 && ingredients.length > 0
  const each = perServing(ingredients, servings)
  const total = recipeTotals(ingredients)

  async function save() {
    setTouched(true)
    if (!valid) return
    await saveRecipe({ id: recipe?.id, foodId: recipe?.foodId, name, servings, ingredients })
    onClose()
  }

  async function remove() {
    if (!recipe) return
    if (!(await askConfirm('Los días ya registrados conservan sus datos.', { title: `¿Borrar la receta «${recipe.name}»?`, confirmLabel: 'Borrar', danger: true }))) return
    await deleteRecipe(recipe)
    onClose()
  }

  if (adding) {
    return (
      <PickFoodSheet
        title="Añadir ingrediente"
        confirmLabel="Añadir a la receta"
        onClose={() => setAdding(false)}
        onPick={(food, amount, grams) => {
          setIngredients([
            ...ingredients,
            { foodId: food.id, name: food.name, per100: { kcal: food.kcal, carbs: food.carbs, protein: food.protein, fat: food.fat }, grams, amount },
          ])
          setAdding(false)
        }}
      />
    )
  }

  return (
    <Sheet
      title={recipe ? 'Editar receta' : 'Nueva receta'}
      onClose={onClose}
      footer={
        <div className="footer-row">
          {recipe && (
            <button className="btn danger ghost" onClick={remove}>
              Borrar
            </button>
          )}
          <button type="submit" form="recipe-form" className="btn primary grow">
            {recipe ? 'Guardar cambios' : 'Crear receta'}
          </button>
        </div>
      }
    >
      <form
        id="recipe-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="field">
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!recipe} placeholder="p. ej. Arroz con pollo" aria-invalid={touched && !name.trim()} />
        </label>

        <label className="field">
          <span>Raciones que salen</span>
          <div className="input-suffix">
            <input
              inputMode="numeric"
              value={servingsText}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setServingsText(e.target.value)}
              aria-invalid={touched && servings <= 0}
            />
            <span>raciones</span>
          </div>
        </label>

        <fieldset className="fieldset">
          <legend>Ingredientes</legend>
          {ingredients.length === 0 ? (
            <p className="hint">Añade los ingredientes con la cantidad que lleva la receta entera.</p>
          ) : (
            <ul className="ingredients">
              {ingredients.map((ing, i) => (
                <li key={i}>
                  <span className="ing-main">
                    <span className="ing-name">{ing.name}</span>
                    <span className="muted">{gramsText(ing.grams)}</span>
                  </span>
                  <span className="ing-kcal">{kcal((ing.per100.kcal * ing.grams) / 100)} kcal</span>
                  <button type="button" className="icon-btn" aria-label={`Quitar ${ing.name}`} onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn ghost small" onClick={() => setAdding(true)}>
            + Añadir ingrediente
          </button>
        </fieldset>

        {ingredients.length > 0 && (
          <section className="recipe-totals" aria-live="polite">
            <h3>Por ración</h3>
            <div className="recipe-kcal">
              <strong>{kcal(each.kcal)}</strong> kcal
              <span className="muted"> · {gramsText(servingGrams(ingredients, servings))}</span>
            </div>
            <ul className="recipe-macros">
              {MACROS.map((m) => (
                <li key={m} className={`macro-${m}`}>
                  <span className="swatch" aria-hidden="true" />
                  {MACRO_LABEL[m]} <strong>{num(each[m])} g</strong>
                </li>
              ))}
            </ul>
            <p className="hint">
              Receta entera: {kcal(total.kcal)} kcal y {gramsText(totalGrams(ingredients))}. Se guarda también como alimento, para apuntarla como «1 ración».
            </p>
          </section>
        )}
      </form>
    </Sheet>
  )
}
