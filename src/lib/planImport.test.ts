import { describe, expect, it } from 'vitest'
import type { Food, Recipe } from '../db'
import { buildPrompt, extractJson, findRecipes, foodNamesForPrompt, matchFood, parsePlan, sameWord } from './planImport'

const answer = `Claro, aquí tienes tu plan:

\`\`\`json
{"dias":[
 {"dia":"lunes","comidas":{"desayuno":[{"alimento":"copos de avena","gramos":60},{"alimento":"leche semidesnatada","gramos":250}],"comida":[{"alimento":"arroz blanco","gramos":80}],"merienda":[],"cena":[{"alimento":"merluza","gramos":150}]}},
 {"dia":"martes","comidas":{"desayuno":[{"alimento":"pan integral","gramos":"60 g"}],"cena":[{"alimento":"huevo","gramos":120}]}}
]}
\`\`\`

¡Que aproveche!`

describe('extractJson', () => {
  it('finds the JSON inside code fences and chatter', () => {
    expect(extractJson(answer)).toHaveProperty('dias')
  })

  it('finds it without fences too', () => {
    expect(extractJson('Aquí va: {"dias":[]} espero que te sirva')).toEqual({ dias: [] })
  })

  it('returns null when there is no JSON', () => {
    expect(extractJson('Lunes: avena con leche')).toBeNull()
  })
})

describe('parsePlan', () => {
  it('reads days, meals and amounts', () => {
    const plan = parsePlan(extractJson(answer))
    expect(plan.days).toHaveLength(2)
    expect(plan.days[0].index).toBe(0)
    expect(plan.days[0].meals.breakfast.map((i) => [i.name, i.grams])).toEqual([
      ['copos de avena', 60],
      ['leche semidesnatada', 250],
    ])
    expect(plan.days[0].meals.dinner[0].name).toBe('merluza')
    // "60 g" as a string still reads as 60.
    expect(plan.days[1].meals.breakfast[0].grams).toBe(60)
  })

  it('reports what it had to skip', () => {
    const plan = parsePlan({ dias: [{ dia: 'lunes', comidas: { desayuno: [{ alimento: 'café' }], postre: [] } }] })
    expect(plan.issues).toEqual(['"café" no trae cantidad en gramos.', '"postre" no es una comida conocida.'])
  })

  it('handles a plan with no days at all', () => {
    expect(parsePlan({ foo: 1 }).days).toEqual([])
    expect(parsePlan({ foo: 1 }).issues).toHaveLength(1)
  })

  it("reads the assistant's own estimate when it gives one", () => {
    const plan = parsePlan({ dias: [{ dia: 'lunes', kcal_estimado: 2410, comidas: { cena: [{ alimento: 'sopa', gramos: 300 }] } }] })
    expect(plan.days[0].claimedKcal).toBe(2410)
  })

  it('accepts "Día 3" as well as weekday names', () => {
    expect(parsePlan({ dias: [{ dia: 'Día 3', comidas: { cena: [{ alimento: 'sopa', gramos: 300 }] } }] }).days[0].index).toBe(2)
  })
})

const food = (id: string, name: string): Food => ({ id, name, kcal: 100, carbs: 1, protein: 1, fat: 1, servings: [] })
const foods = [food('f1', 'Arroz blanco (crudo)'), food('f2', 'Arroz integral (crudo)'), food('f3', 'Leche semidesnatada'), food('f4', 'Pechuga de pollo (cruda)')]

describe('matchFood', () => {
  it('matches on every word, ignoring accents and case', () => {
    expect(matchFood('arroz blanco', foods)?.food.id).toBe('f1')
    expect(matchFood('LECHE Semidesnatada', foods)?.food.id).toBe('f3')
  })

  it('accepts a partial match when it is good enough', () => {
    expect(matchFood('pechuga de pollo a la plancha', foods)?.food.id).toBe('f4')
  })

  it('gives up when nothing is close', () => {
    expect(matchFood('tofu marinado', foods)).toBeNull()
  })

  // The bug: "claras de huevo" became "Huevo", so eggs appeared twice in one breakfast.
  const eggs = [food('f10', 'Huevo'), food('f11', 'Clara de huevo')]

  it('tells egg whites apart from whole eggs, plural or not', () => {
    expect(matchFood('claras de huevo', eggs)?.food.id).toBe('f11')
    expect(matchFood('clara de huevo', eggs)?.food.id).toBe('f11')
    expect(matchFood('huevos', eggs)?.food.id).toBe('f10')
    expect(matchFood('huevo', eggs)?.food.id).toBe('f10')
  })

  it('prefers the food whose whole name is covered', () => {
    expect(matchFood('tomates', [food('f20', 'Tomate'), food('f21', 'Tomate triturado en conserva')])?.food.id).toBe('f20')
  })
})

describe('sameWord', () => {
  it('treats Spanish plurals as the same word', () => {
    expect(sameWord('claras', 'clara')).toBe(true)
    expect(sameWord('tomate', 'tomates')).toBe(true)
  })

  it('keeps short and unrelated words apart', () => {
    expect(sameWord('pan', 'panceta')).toBe(false)
    expect(sameWord('leche', 'lechuga')).toBe(false)
  })
})

describe('findRecipes', () => {
  const recipe = { id: 'r1', name: 'Arroz con pollo', servings: 4, foodId: 'f99', createdAt: 0, ingredients: [
    { foodId: 'f1', name: 'Arroz', per100: { kcal: 0, carbs: 0, protein: 0, fat: 0 }, grams: 400, amount: { quantity: 400 } },
    { foodId: 'f4', name: 'Pollo', per100: { kcal: 0, carbs: 0, protein: 0, fat: 0 }, grams: 600, amount: { quantity: 600 } },
  ] } satisfies Recipe

  it('spots a recipe when all its ingredients are in the meal', () => {
    const hits = findRecipes([{ key: 'a', foodId: 'f1', grams: 80 }, { key: 'b', foodId: 'f4', grams: 150 }, { key: 'c', foodId: 'f3', grams: 200 }], [recipe])
    expect(hits).toHaveLength(1)
    expect(hits[0].keys).toEqual(['a', 'b'])
    expect(hits[0].grams).toBe(230)
  })

  it('ignores a meal that only has part of the recipe', () => {
    expect(findRecipes([{ key: 'a', foodId: 'f1', grams: 80 }], [recipe])).toEqual([])
  })
})

describe('buildPrompt', () => {
  const goals = { kcal: 2400, split: { carbs: 40, protein: 30, fat: 30 } }

  it('states the goals, the allowed range and the answer format', () => {
    const prompt = buildPrompt(goals, { days: 7, notes: 'sin lactosa' })
    expect(prompt).toContain('2400 kcal')
    expect(prompt).toContain('entre 2280 y 2520 kcal')
    expect(prompt).toContain('240 g de carbohidratos, 180 g de proteínas y 80 g de grasas')
    expect(prompt).toContain('sin lactosa')
    expect(prompt).toContain('"dias"')
    expect(prompt).toContain('kcal_estimado')
  })

  it('insists on raw weights, since the food data is raw', () => {
    const prompt = buildPrompt(goals, { days: 7 })
    expect(prompt).toContain('crudo')
    expect(prompt).toContain('250 g de arroz cocido, escribe 80 g de arroz')
  })

  it('asks only for the meals the person uses', () => {
    const prompt = buildPrompt(goals, { days: 7, meals: ['breakfast', 'lunch', 'dinner'] })
    expect(prompt).toContain('Comidas de cada día: desayuno, comida, cena.')
    expect(prompt).not.toContain('merienda')
    expect(prompt).toContain('"cena":[]')
  })

  it('reads meal names beyond the usual four', () => {
    const plan = parsePlan({ dias: [{ dia: 'lunes', comidas: { 'media mañana': [{ alimento: 'fruta', gramos: 150 }], recena: [{ alimento: 'yogur', gramos: 125 }] } }] })
    expect(plan.days[0].meals.midmorning[0].name).toBe('fruta')
    expect(plan.days[0].meals.latenight[0].name).toBe('yogur')
  })

  it('lists the person\'s recipes so the assistant can use them whole', () => {
    const prompt = buildPrompt(goals, { days: 7, recipes: [{ name: 'Arroz con pollo', servingGrams: 250 }] })
    expect(prompt).toContain('Arroz con pollo (1 ración = 250 g)')
  })

  it('offers the app\'s own food names when given them', () => {
    const prompt = buildPrompt(goals, { days: 7, foodNames: ['Arroz blanco (crudo)', 'Huevo'] })
    expect(prompt).toContain('Arroz blanco (crudo), Huevo')
  })
})

describe('foodNamesForPrompt', () => {
  it('puts the most recently used foods first and leaves supermarket products out', () => {
    const list = [
      { ...food('f1', 'Arroz blanco (crudo)'), category: 'Cereales, pan y pasta' },
      { ...food('f2', 'Yogur natural'), category: 'Lácteos y bebidas vegetales', lastUsed: 5 },
      { ...food('f3', 'Bollería de marca'), category: 'Supermercado', lastUsed: 9 },
    ]
    expect(foodNamesForPrompt(list)).toEqual(['Yogur natural', 'Arroz blanco (crudo)'])
  })
})
