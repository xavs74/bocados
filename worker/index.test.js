import { describe, expect, it } from 'vitest'
import { normalize, rank, servingGrams, withoutBrand } from './index.js'

const product = {
  code: '8480000108487',
  product_name: 'Leche desnatada - Hacendado',
  brands: ['Hacendado'],
  nutriments: { 'energy-kcal_100g': 35, carbohydrates_100g: 4.9, proteins_100g: 3.2, fat_100g: 0.3 },
  serving_size: '250 ml',
  countries_tags: ['en:spain'],
}

describe('normalize', () => {
  it('keeps products with values per 100 g and drops the repeated brand', () => {
    expect(normalize(product)).toMatchObject({ name: 'Leche desnatada', brand: 'Hacendado', kcal: 35, serving: 250, spain: true })
  })

  it('drops products without a name or without macros', () => {
    expect(normalize({ ...product, product_name: '' })).toBeNull()
    expect(normalize({ ...product, nutriments: { 'energy-kcal_100g': 35 } })).toBeNull()
  })

  it('converts kilojoules when kcal are missing', () => {
    const kj = { ...product, nutriments: { ...product.nutriments, 'energy-kcal_100g': undefined, 'energy-kj_100g': 1000 } }
    expect(normalize(kj).kcal).toBeCloseTo(239, 0)
  })

  it('rejects impossible energy values', () => {
    expect(normalize({ ...product, nutriments: { ...product.nutriments, 'energy-kcal_100g': 5000 } })).toBeNull()
  })
})

describe('rank', () => {
  const items = [
    { name: 'Barrita', brand: 'Hacendado', spain: true },
    { name: 'Pechuga de pollo', brand: 'Hacendado', spain: true },
    { name: 'Pechuga de pollo', brand: 'Otra marca', spain: false },
  ]

  it('puts products matching every word first', () => {
    expect(rank(items, 'pechuga hacendado')[0].name).toBe('Pechuga de pollo')
    expect(rank(items, 'pechuga hacendado')[0].brand).toBe('Hacendado')
  })

  it('ignores accents and case', () => {
    expect(rank([{ name: 'Melocotón', brand: null, spain: true }], 'melocoton')).toHaveLength(1)
  })

  it('falls back to partial matches instead of returning nothing', () => {
    expect(rank(items, 'pechuga inexistente').length).toBeGreaterThan(0)
  })
})

describe('servingGrams', () => {
  it('reads grams or millilitres, and ignores nonsense', () => {
    expect(servingGrams({ serving_size: '30 g' })).toBe(30)
    expect(servingGrams({ serving_quantity: 125 })).toBe(125)
    expect(servingGrams({ serving_size: '1 vaso' })).toBeNull()
    expect(servingGrams({ serving_quantity: 99999 })).toBeNull()
  })
})

describe('withoutBrand', () => {
  it('removes the brand repeated at the end', () => {
    expect(withoutBrand('Fricandó - Hacendado - Hacendado', 'Hacendado')).toBe('Fricandó')
    expect(withoutBrand('Hacendado', 'Hacendado')).toBe('Hacendado')
  })
})
