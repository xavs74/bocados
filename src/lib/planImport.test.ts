import { describe, expect, it } from 'vitest'
import type { Food } from '../db'
import { buildPrompt, extractJson, matchFood, parsePlan } from './planImport'

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
  it('states the goals and the answer format', () => {
    const prompt = buildPrompt({ kcal: 2000, split: { carbs: 40, protein: 30, fat: 30 } }, { days: 7, notes: 'sin lactosa' })
    expect(prompt).toContain('2000 kcal')
    expect(prompt).toContain('200 g de carbohidratos, 150 g de proteínas, 67 g de grasas')
    expect(prompt).toContain('sin lactosa')
    expect(prompt).toContain('"dias"')
  })
})
