import { kcal, num, pct } from '../lib/format'
import { MACROS, MACRO_LABEL, calorieSplit, goalGrams, onTarget, type Goals, type Nutrients } from '../lib/nutrition'

interface Props {
  totals: Nutrients
  goals: Goals
}

export function Summary({ totals, goals }: Props) {
  const remaining = goals.kcal - totals.kcal
  const progress = goals.kcal > 0 ? totals.kcal / goals.kcal : 0
  const split = calorieSplit(totals)
  const targets = goalGrams(goals)
  const hasFood = totals.kcal > 0 || totals.carbs + totals.protein + totals.fat > 0

  return (
    <section className="card summary" aria-label="Daily summary">
      <div className="ring-wrap">
        <Ring progress={progress} over={remaining < 0} />
        <div className="ring-center">
          <strong>{kcal(Math.abs(remaining))}</strong>
          <span>{remaining < 0 ? 'kcal over' : 'kcal left'}</span>
        </div>
      </div>
      <p className="ring-caption">
        {kcal(totals.kcal)} of {kcal(goals.kcal)} kcal
      </p>

      <ul className="macro-list">
        {MACROS.map((m) => {
          const ratio = targets[m] > 0 ? totals[m] / targets[m] : 0
          const status = !hasFood ? 'idle' : onTarget(split[m], goals.split[m]) ? 'good' : 'off'
          return (
            <li key={m} className={`macro macro-${m}`}>
              <div className="macro-top">
                <span className="macro-name">{MACRO_LABEL[m]}</span>
                <span className="macro-grams">
                  {num(totals[m])} <span className="muted">/ {Math.round(targets[m])} g</span>
                </span>
              </div>
              <div className="bar" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${MACRO_LABEL[m]} grams`}>
                <div className="bar-fill" style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
                {ratio > 1 && <div className="bar-over" style={{ width: `${Math.min(ratio - 1, 1) * 100}%` }} />}
              </div>
              <div className={`macro-split status-${status}`}>
                <span className="dot" aria-hidden="true" />
                {hasFood ? pct(split[m]) : '–'} of kcal
                <span className="muted"> · target {pct(goals.split[m])}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Ring({ progress, over }: { progress: number; over: boolean }) {
  const r = 52
  const c = 2 * Math.PI * r
  const shown = Math.min(progress, 1)
  return (
    <svg className={`ring ${over ? 'ring-over' : ''}`} viewBox="0 0 120 120" aria-hidden="true">
      <circle className="ring-track" cx="60" cy="60" r={r} />
      <circle
        className="ring-fill"
        cx="60"
        cy="60"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - shown)}
        transform="rotate(-90 60 60)"
      />
    </svg>
  )
}
