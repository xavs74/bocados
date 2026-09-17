import { describe, expect, it } from 'vitest'
import type { Food } from '../db'
import { buildPrompt, extractJson, foodNamesForPrompt, matchFood, parsePlan } from './planImport'

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

const food = (id: number, name: string): Food => ({ id, name, kcal: 100, carbs: 1, protein: 1, fat: 1, servings: [] })
const foods = [food(1, 'Arroz blanco (crudo)'), food(2, 'Arroz integral (crudo)'), food(3, 'Leche semidesnatada'), food(4, 'Pechuga de pollo (cruda)')]

describe('matchFood', () => {
  it('matches on every word, ignoring accents and case', () => {
    expect(matchFood('arroz blanco', foods)?.food.id).toBe(1)
    expect(matchFood('LECHE Semidesnatada', foods)?.food.id).toBe(3)
  })

  it('accepts a partial match when it is good enough', () => {
    expect(matchFood('pechuga de pollo a la plancha', foods)?.food.id).toBe(4)
  })

  it('gives up when nothing is close', () => {
    expect(matchFood('tofu marinado', foods)).toBeNull()
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

  it('offers the app\'s own food names when given them', () => {
    const prompt = buildPrompt(goals, { days: 7, foodNames: ['Arroz blanco (crudo)', 'Huevo'] })
    expect(prompt).toContain('Arroz blanco (crudo), Huevo')
  })
})

describe('foodNamesForPrompt', () => {
  it('puts the most recently used foods first and leaves supermarket products out', () => {
    const list = [
      { ...food(1, 'Arroz blanco (crudo)'), category: 'Cereales, pan y pasta' },
      { ...food(2, 'Yogur natural'), category: 'Lácteos y bebidas vegetales', lastUsed: 5 },
      { ...food(3, 'Bollería de marca'), category: 'Supermercado', lastUsed: 9 },
    ]
    expect(foodNamesForPrompt(list)).toEqual(['Yogur natural', 'Arroz blanco (crudo)'])
  })
})
