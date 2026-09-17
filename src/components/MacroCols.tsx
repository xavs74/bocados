import { kcal, num } from '../lib/format'
import type { Nutrients } from '../lib/nutrition'

/** kcal, carbs, protein and fat as aligned table columns (laptop layout). */
export function MacroCols({ n, strong }: { n: Nutrients; strong?: boolean }) {
  return (
    <span className={`macro-cols ${strong ? 'strong' : ''}`}>
      <span className="col-kcal">{kcal(n.kcal)}</span>
      <span className="col-carbs">{num(n.carbs)}</span>
      <span className="col-protein">{num(n.protein)}</span>
      <span className="col-fat">{num(n.fat)}</span>
    </span>
  )
}

export function MacroColsHead() {
  return (
    <span className="macro-cols">
      <span>kcal</span>
      <span>Carb</span>
      <span>Prot</span>
      <span>Grasa</span>
    </span>
  )
}
