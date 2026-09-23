import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState } from 'react'
import { BarcodeIcon, ProductResults } from '../components/AddEntry'
import { FoodForm } from '../components/FoodForm'
import { RecipeForm } from '../components/RecipeForm'
import { Sheet } from '../components/Sheet'
import { ScanSheet } from '../components/ScanSheet'
import { db, type Food, type Id, type Recipe } from '../db'
import { addMissingBasicFoods, missingBasicFoods } from '../lib/basicFoods'
import { categoryOf, groupByCategory } from '../lib/categories'
import { kcal, matches, num } from '../lib/format'
import { kcalLooksWrong } from '../lib/nutrition'
import { useIsLaptop } from '../lib/useMediaQuery'
import { MacroCols, MacroColsHead } from '../components/MacroCols'
import { askConfirm } from '../lib/confirm'

export function Foods() {
  const laptop = useIsLaptop()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Food | 'new' | null>(null)
  // null when not selecting; otherwise the ids picked for deletion.
  const [selected, setSelected] = useState<Set<Id> | null>(null)
  const [scanning, setScanning] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>()
  // 'choose' shows what to create; 'new' is a new recipe; a Recipe is an edit.
  const [recipe, setRecipe] = useState<Recipe | 'new' | 'choose' | null>(null)
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), [])
  const recipes = useLiveQuery(() => db.recipes.toArray(), [])
  const close = useCallback(() => {
    setEditing(null)
    setScannedBarcode(undefined)
  }, [])
  const closeRecipe = useCallback(() => setRecipe(null), [])

  /** Recipe foods open their recipe instead of the food form. */
  function open(food: Food) {
    const linked = food.recipeId ? recipes?.find((r) => r.id === food.recipeId) : undefined
    if (linked) setRecipe(linked)
    else setEditing(food)
  }

  const searching = query.trim() !== ''
  const shown = useMemo(() => (foods ?? []).filter((f) => matches(f.name, query)), [foods, query])
  const groups = useMemo(() => groupByCategory(shown), [shown])
  const missing = useMemo(() => (foods ? missingBasicFoods(foods).length : 0), [foods])

  async function remove(food: Food) {
    if (!(await askConfirm('Los días ya registrados conservan sus datos.', { title: `¿Borrar «${food.name}»?`, confirmLabel: 'Borrar', danger: true }))) return
    await db.foods.delete(food.id)
    setEditing(null)
  }

  async function removeSelected() {
    if (!selected?.size) return
    const n = selected.size
    if (!(await askConfirm('Los días ya registrados conservan sus datos.', { title: `¿Borrar ${n} ${n === 1 ? 'alimento' : 'alimentos'}?`, confirmLabel: 'Borrar', danger: true }))) return
    await db.foods.bulkDelete([...selected])
    setSelected(null)
  }

  function toggle(id: Id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const allShownSelected = !!selected && shown.length > 0 && shown.every((f) => selected.has(f.id))

  function toggleAllShown() {
    const next = new Set(selected)
    for (const f of shown) {
      if (allShownSelected) next.delete(f.id)
      else next.add(f.id)
    }
    setSelected(next)
  }

  const basicBanner = missing > 0 && !selected && !searching && (
    <BasicFoodsBanner missing={missing} total={foods?.length ?? 0} />
  )

  return (
    <div className={`foods ${selected ? 'selecting' : ''}`}>
      <a className="back-link" href="#/goals">
        <BackChevron /> Objetivos
      </a>
      <div className="page-head">
        <h1>Alimentos</h1>
        <div className="head-actions">
          {selected ? (
            <button className="btn ghost small" onClick={() => setSelected(null)}>
              Cancelar
            </button>
          ) : (
            <>
              <button className="btn ghost small" onClick={() => setSelected(new Set())} disabled={!foods?.length}>
                Seleccionar
              </button>
              <button className="btn primary small" onClick={() => setRecipe('choose')}>
                + Nuevo
              </button>
            </>
          )}
        </div>
      </div>
      <div className="search sticky with-scan">
        <input
          type="search"
          placeholder={`Buscar entre ${foods?.length ?? ''} alimentos`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar alimento"
        />
        <button type="button" className="scan-btn" onClick={() => setScanning(true)} aria-label="Escanear código de barras" title="Escanear código de barras">
          <BarcodeIcon />
        </button>
      </div>

      {added && (
        <p className="added-note" role="status">
          ✓ Añadido a tus alimentos: {added}
        </p>
      )}

      {/* Devices that started with the old personal list see this first; everyone else at the end. */}
      {missing >= 20 && basicBanner}

      {foods && shown.length === 0 && (
        <div className="empty">
          <p>{searching ? `Ningún alimento coincide con «${query}».` : 'Todavía no hay alimentos.'}</p>
          {!selected && (
            <button className="btn ghost small" onClick={() => setEditing('new')}>
              Crear uno
            </button>
          )}
        </div>
      )}

      <div className="foods-layout">
        {laptop && !searching && groups.length > 1 && (
          <nav className="cat-index" aria-label="Categorías">
            {groups.map((g) => (
              <a
                key={g.category}
                href={`#cat-${slug(g.category)}`}
                onClick={(e) => {
                  // Hash links drive the tabs, so scroll by hand.
                  e.preventDefault()
                  document.getElementById(`cat-${slug(g.category)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                <span>{g.category}</span>
                <span className="muted">{g.foods.length}</span>
              </a>
            ))}
          </nav>
        )}
        <div className="foods-main">
          {laptop && shown.length > 0 && (
            <div className="food-table-head" aria-hidden="true">
              {selected && <span />}
              <span>Alimento</span>
              <MacroColsHead />
              <span>Raciones</span>
            </div>
          )}
          {searching ? (
            shown.length > 0 && <FoodList foods={shown} selected={selected} showCategory laptop={laptop} onToggle={toggle} onOpen={open} />
          ) : (
            groups.map((g) => (
              <section key={g.category} id={`cat-${slug(g.category)}`} className="food-group" aria-label={g.category}>
                <h2 className="group-title">
                  {g.category} <span className="muted">· {g.foods.length}</span>
                </h2>
                <FoodList foods={g.foods} selected={selected} laptop={laptop} onToggle={toggle} onOpen={open} />
              </section>
            ))
          )}
        </div>
      </div>

      {/* Supermarket products, so foods can be added to the list without logging them. */}
      {searching && !selected && <ProductResults query={query} onPick={(f) => setAdded(f.name)} action="Guardar" />}

      {missing > 0 && missing < 20 && basicBanner}

      {selected && (
        <div className="selection-bar" role="toolbar" aria-label="Acciones de selección">
          <button className="btn ghost small" onClick={toggleAllShown} disabled={shown.length === 0}>
            {allShownSelected ? 'Ninguno' : 'Todos'}
          </button>
          <span className="selection-count">
            {selected.size} {selected.size === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
          <button className="btn danger-solid small" onClick={removeSelected} disabled={selected.size === 0}>
            Borrar
          </button>
        </div>
      )}

      <p className="attribution">
        Los productos de supermercado vienen de{' '}
        <a href="https://es.openfoodfacts.org" target="_blank" rel="noreferrer">
          Open Food Facts
        </a>{' '}
        (licencia ODbL).
      </p>

      {recipe === 'choose' && (
        <Sheet title="¿Qué quieres crear?" onClose={closeRecipe}>
          <div className="choose-new">
            <button
              className="choice-card"
              onClick={() => {
                setRecipe(null)
                setEditing('new')
              }}
            >
              <strong>Un alimento</strong>
              <span className="muted">Con sus valores por 100 g, como los de un envase.</span>
            </button>
            <button className="choice-card" onClick={() => setRecipe('new')}>
              <strong>Una receta</strong>
              <span className="muted">Varios alimentos y las raciones que salen. Se apunta como «1 ración».</span>
            </button>
          </div>
        </Sheet>
      )}

      {recipe === 'new' && <RecipeForm onClose={closeRecipe} />}
      {recipe && recipe !== 'new' && recipe !== 'choose' && <RecipeForm recipe={recipe} onClose={closeRecipe} />}

      {scanning && (
        <ScanSheet
          onFound={(food) => {
            setScanning(false)
            setAdded(food.name)
          }}
          onCreate={(barcode) => {
            setScanning(false)
            setEditing('new')
            setScannedBarcode(barcode)
          }}
          onClose={() => setScanning(false)}
        />
      )}

      {editing === 'new' && <FoodForm initialName={query.trim()} initialBarcode={scannedBarcode} onClose={close} />}
      {editing && editing !== 'new' && <FoodForm food={editing} onClose={close} onDelete={() => remove(editing)} />}
    </div>
  )
}

const slug = (s: string) => s.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()

interface ListProps {
  foods: Food[]
  selected: Set<Id> | null
  showCategory?: boolean
  laptop: boolean
  onToggle: (id: Id) => void
  onOpen: (food: Food) => void
}

function FoodList({ foods, selected, showCategory, laptop, onToggle, onOpen }: ListProps) {
  return (
    <ul className="food-list card">
      {foods.map((f) => {
        const checked = !!selected?.has(f.id)
        return (
          <li key={f.id} className={checked ? 'checked' : ''}>
            <button
              className="food-row with-text"
              onClick={() => (selected ? onToggle(f.id) : onOpen(f))}
              role={selected ? 'checkbox' : undefined}
              aria-checked={selected ? checked : undefined}
            >
              {selected && <span className="check" aria-hidden="true" />}
              <span className="food-text">
                <span className="food-name">
                  {f.name}
                  {kcalLooksWrong(f) && (
                    <span className="badge warn" title="Las kcal no cuadran con los macros">
                      revisar
                    </span>
                  )}
                </span>
                {laptop ? (
                  showCategory && <span className="food-meta">{categoryOf(f)}</span>
                ) : (
                  <span className="food-meta">
                    {kcal(f.kcal)} kcal · Carb {num(f.carbs)} · Prot {num(f.protein)} · Grasa {num(f.fat)}
                    {showCategory && <span className="muted"> · {categoryOf(f)}</span>}
                  </span>
                )}
              </span>
              {laptop && (
                <>
                  <MacroCols n={f} />
                  <span className="col-servings muted">{f.servings.map((s) => s.label).join(', ') || '–'}</span>
                </>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function BasicFoodsBanner({ missing, total }: { missing: number; total: number }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="card pad basic-banner">
      <div>
        <strong>Lista básica de alimentos</strong>
        <p className="hint">
          {total === 0
            ? `Añade ${missing} alimentos comunes con valores nutricionales medios.`
            : `Faltan ${missing} alimentos comunes (frutas, carnes, lácteos…) con valores medios. Los tuyos no se tocan.`}
        </p>
      </div>
      <button
        className="btn primary small"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await addMissingBasicFoods()
          setBusy(false)
        }}
      >
        Añadir {missing}
      </button>
    </div>
  )
}

function BackChevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}
