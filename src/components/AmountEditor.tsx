import { gramsOf, type Serving } from '../db'
import { amountFrom, switchUnit, type AmountDraft } from '../lib/amount'
import { grams, kcal, num } from '../lib/format'
import { scale, type Nutrients } from '../lib/nutrition'

interface Props {
  draft: AmountDraft
  onChange: (d: AmountDraft) => void
  servings: Serving[]
  per100: Nutrients
  autoFocus?: boolean
}

export function AmountEditor({ draft, onChange, servings, per100, autoFocus }: Props) {
  const amount = amountFrom(draft, servings)
  const n = amount ? scale(per100, gramsOf(amount)) : null

  return (
    <div className="amount-editor">
      <div className="amount-row">
        <label className="field grow">
          <span>Cantidad</span>
          <input
            inputMode="decimal"
            value={draft.text}
            autoFocus={autoFocus}
            onFocus={(e) => e.target.select()}
            onChange={(e) => onChange({ ...draft, text: e.target.value })}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }}
            aria-invalid={!amount}
          />
        </label>
        <label className="field">
          <span>Unidad</span>
          <select value={draft.unit} onChange={(e) => onChange(switchUnit(draft, servings, Number(e.target.value)))}>
            <option value={-1}>gramos</option>
            {servings.map((s, i) => (
              <option key={i} value={i}>
                {s.label} ({num(s.grams)} g)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="preview" aria-live="polite">
        {n && amount ? (
          <>
            <div className="preview-kcal">
              <strong>{kcal(n.kcal)}</strong> kcal
              {amount.serving && <span className="muted"> · {grams(gramsOf(amount))}</span>}
            </div>
            <div className="preview-macros">
              <span className="chip chip-carbs">Carb {num(n.carbs)} g</span>
              <span className="chip chip-protein">Prot {num(n.protein)} g</span>
              <span className="chip chip-fat">Grasa {num(n.fat)} g</span>
            </div>
          </>
        ) : (
          <span className="muted">Escribe una cantidad mayor que cero</span>
        )}
      </div>
    </div>
  )
}
