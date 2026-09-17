/** Categories of the built-in food list, in the order the list shows them. */
export const CATEGORIES = [
  'Frutas',
  'Verduras y hortalizas',
  'Legumbres',
  'Cereales, pan y pasta',
  'Carnes',
  'Embutidos',
  'Pescados y mariscos',
  'Huevos',
  'Lácteos y bebidas vegetales',
  'Frutos secos y semillas',
  'Aceites, salsas y condimentos',
  'Dulces y snacks',
  'Platos y bebidas',
] as const

/** Where foods without a category go: the ones people create themselves. */
export const OWN_CATEGORY = 'Mis alimentos'

export function categoryOf(food: { category?: string }): string {
  return food.category || OWN_CATEGORY
}

/** Groups foods by category: own foods first (they're the ones people look for), then the built-in order. */
export function groupByCategory<T extends { category?: string }>(foods: T[]): { category: string; foods: T[] }[] {
  const order = [OWN_CATEGORY, ...CATEGORIES] as string[]
  const groups = new Map<string, T[]>()
  for (const f of foods) {
    const c = categoryOf(f)
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c)!.push(f)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => rank(order, a) - rank(order, b))
    .map(([category, foods]) => ({ category, foods }))
}

function rank(order: string[], c: string) {
  const i = order.indexOf(c)
  return i === -1 ? order.length : i
}
