import { useState } from 'react'
import { db } from '../db'
import { askConfirm } from '../lib/confirm'
import { fullDate, isoDate } from '../lib/dates'
import { inputNum, parseNum } from '../lib/format'
import { Sheet } from './Sheet'

const MIN_KG = 25
const MAX_KG = 350

/** Add or change a weigh-in. The date is the key, so a second one replaces the day's. */
export function WeightSheet({ date: initial, kg: initialKg, onClose }: { date?: string; kg?: number; onClose: () => void }) {
  const today = isoDate()
  const [date, setDate] = useState(initial ?? today)
  const [text, setText] = useState(initialKg ? inputNum(initialKg) : '')
  const kg = parseNum(text)
  const valid = Number.isFinite(kg) && kg >= MIN_KG && kg <= MAX_KG

  async function save() {
    if (!valid) return
    await db.weights.put({ date, kg, createdAt: Date.now() })
    onClose()
  }

  async function remove() {
    onClose()
    if (await askConfirm(`Se borra el peso del ${fullDate(date).toLowerCase()}.`, { title: '¿Borrar este peso?', confirmLabel: 'Borrar', danger: true })) {
      await db.weights.delete(date)
    }
  }

  return (
    <Sheet
      title={initial ? 'Cambiar el peso' : 'Apuntar mi peso'}
      onClose={onClose}
      footer={
        <div className="footer-row">
          {initial ? (
            <button type="button" className="btn ghost" onClick={remove}>
              Borrar
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
          )}
          <button type="submit" form="weight-form" className="btn primary grow" disabled={!valid}>
            Guardar
          </button>
        </div>
      }
    >
      <form
        id="weight-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="field">
          <span>Peso</span>
          <div className="input-suffix">
            <input
              type="text"
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="78,4"
              autoFocus
              aria-label="Peso en kilos"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <span className="suffix">kg</span>
          </div>
        </label>
        <label className="field">
          <span>Día</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        <p className="hint">
          Con una o dos veces por semana basta. Mejor siempre en las mismas condiciones, por ejemplo por la mañana: el peso sube y baja casi un kilo con el agua y la sal, y lo que
          cuenta es hacia dónde va.
        </p>
      </form>
    </Sheet>
  )
}
