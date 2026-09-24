import { describe, expect, it } from 'vitest'
import { switchUnit } from './amount'

const servings = [
  { label: '1 ración', grams: 300 },
  { label: '1 vaso', grams: 250 },
]

describe('switchUnit', () => {
  it('makes it one helping instead of 250 of them', () => {
    expect(switchUnit({ text: '250', unit: -1 }, servings, 0)).toEqual({ text: '1', unit: 0 })
  })

  it('keeps the weight when going back to grams', () => {
    // 2 raciones of 300 g is 600 g, not 2 g.
    expect(switchUnit({ text: '2', unit: 0 }, servings, -1)).toEqual({ text: '600', unit: -1 })
  })

  it('rounds the grams to something someone would type', () => {
    expect(switchUnit({ text: '1,5', unit: 1 }, servings, -1)).toEqual({ text: '375', unit: -1 })
  })

  it('keeps the count between two servings, since both are counts', () => {
    expect(switchUnit({ text: '2', unit: 0 }, servings, 1)).toEqual({ text: '2', unit: 1 })
  })

  it('leaves a half-typed amount alone rather than inventing one', () => {
    expect(switchUnit({ text: '', unit: 0 }, servings, -1)).toEqual({ text: '', unit: -1 })
  })

  it('does nothing when the unit has not changed', () => {
    const draft = { text: '250', unit: -1 }
    expect(switchUnit(draft, servings, -1)).toBe(draft)
  })
})
