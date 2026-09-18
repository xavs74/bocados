import { describe, expect, it } from 'vitest'
import { DEFAULT_GOALS } from '../db'
import { goalsAreSet } from './goals'

describe('goalsAreSet', () => {
  it('treats the untouched default as not set', () => {
    expect(goalsAreSet(DEFAULT_GOALS)).toBe(false)
    expect(goalsAreSet(undefined)).toBe(false)
  })

  it('counts older installs whose goal was changed as set', () => {
    expect(goalsAreSet({ ...DEFAULT_GOALS, kcal: 2400 })).toBe(true)
    expect(goalsAreSet({ ...DEFAULT_GOALS, mode: 'calculated' })).toBe(true)
  })

  it('follows the flag when there is one', () => {
    expect(goalsAreSet({ ...DEFAULT_GOALS, set: true })).toBe(true)
    expect(goalsAreSet({ ...DEFAULT_GOALS, kcal: 2400, set: false })).toBe(false)
  })
})
