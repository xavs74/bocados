import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { inputNum, parseNum, pct } from '../lib/format'
import { MACROS, MACRO_LABEL, MACRO_SHORT, goalGrams, type MacroKey } from '../lib/nutrition'
import { moveDivider, rebalance, type Split } from '../lib/split'

interface Props {
  split: Split
  kcal: number
  onChange: (split: Split) => void
}

const STEP = 5

/**
 * Macro split that always adds up to 100 %: a bar with two draggable
 * dividers, plus per-macro steppers that take the difference from the others.
 */
export function SplitEditor({ split, kcal, onChange }: Props) {
  const grams = goalGrams({ kcal, split })
  return (
    <div className="split-editor">
      <SplitBar split={split} onChange={onChange} />
      <p className="hint">Arrastra las marcas o usa − y +. Los otros dos macros se ajustan solos para que siempre sumen {pct(100)}.</p>
      <ul className="split-rows">
        {MACROS.map((m) => (
          <li key={m} className={`split-row macro-${m}`}>
            <span className="split-label">
              <span className="swatch" aria-hidden="true" />
              {MACRO_LABEL[m]}
            </span>
            <div className="stepper">
              <button type="button" className="step-btn" aria-label={`Menos ${MACRO_LABEL[m].toLowerCase()}`} onClick={() => onChange(rebalance(split, m, split[m] - STEP))}>
                −
              </button>
              <PercentInput key={split[m]} value={split[m]} label={MACRO_LABEL[m]} onCommit={(v) => onChange(rebalance(split, m, v))} />
              <button type="button" className="step-btn" aria-label={`Más ${MACRO_LABEL[m].toLowerCase()}`} onClick={() => onChange(rebalance(split, m, split[m] + STEP))}>
                +
              </button>
            </div>
            <span className="split-grams muted">{Math.round(grams[m])} g</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Commits on blur or Enter so typing "35" doesn't rebalance at "3" first. */
function PercentInput({ value, label, onCommit }: { value: number; label: string; onCommit: (v: number) => void }) {
  const [text, setText] = useState(inputNum(value))
  const commit = () => {
    const v = parseNum(text)
    if (Number.isFinite(v) && v !== value) onCommit(v)
    else setText(inputNum(value))
  }
  return (
    <label className="pct-input">
      <input
        inputMode="numeric"
        value={text}
        aria-label={`${label}, porcentaje`}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span>%</span>
    </label>
  )
}

function SplitBar({ split, onChange }: { split: Split; onChange: (s: Split) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const handleRefs = useRef<(HTMLButtonElement | null)[]>([])
  const dragging = useRef<0 | 1 | null>(null)
  const edges: [number, number] = [split.carbs, split.carbs + split.protein]

  function positionAt(clientX: number) {
    const rect = trackRef.current!.getBoundingClientRect()
    return ((clientX - rect.left) / rect.width) * 100
  }

  // Pressing anywhere on the bar grabs the closest divider, which is easier on a phone than hitting the handle.
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const pos = positionAt(e.clientX)
    const divider = Math.abs(pos - edges[0]) <= Math.abs(pos - edges[1]) ? 0 : 1
    dragging.current = divider
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    handleRefs.current[divider]?.focus()
    move(divider, pos)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging.current === null) return
    move(dragging.current, positionAt(e.clientX))
  }

  function move(divider: 0 | 1, pos: number) {
    const next = moveDivider(split, divider, pos)
    if (next.carbs !== split.carbs || next.protein !== split.protein) onChange(next)
  }

  function onKeyDown(divider: 0 | 1, e: KeyboardEvent<HTMLButtonElement>) {
    const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -STEP, PageUp: STEP }[e.key]
    if (!delta) return
    e.preventDefault()
    onChange(moveDivider(split, divider, edges[divider] + delta))
  }

  return (
    <div
      className="split-bar"
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
    >
      {MACROS.map((m: MacroKey) => (
        <div key={m} className={`split-seg macro-${m}`} style={{ width: `${split[m]}%` }}>
          {split[m] >= 12 && (
            <span>
              {MACRO_SHORT[m]} {pct(split[m])}
            </span>
          )}
        </div>
      ))}
      {([0, 1] as const).map((d) => (
        <button
          key={d}
          type="button"
          className="split-handle"
          style={{ left: `${edges[d]}%` }}
          role="slider"
          aria-label={d === 0 ? 'Límite entre carbohidratos y proteínas' : 'Límite entre proteínas y grasas'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={edges[d]}
          aria-valuetext={
            d === 0 ? `Carbohidratos ${split.carbs} %, proteínas ${split.protein} %` : `Proteínas ${split.protein} %, grasas ${split.fat} %`
          }
          ref={(el) => {
            handleRefs.current[d] = el
          }}
          tabIndex={0}
          onKeyDown={(e) => onKeyDown(d, e)}
        />
      ))}
    </div>
  )
}
