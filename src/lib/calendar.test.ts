import { describe, expect, it } from 'vitest'
import { dayStatus, monthGrid } from './calendar'

describe('monthGrid', () => {
  it('starts weeks on Monday', () => {
    // 1 September 2026 is a Tuesday.
    const weeks = monthGrid(2026, 8)
    expect(weeks[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
    expect(weeks.at(-1)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null])
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('handles a month starting on Sunday', () => {
    // 1 February 2026 is a Sunday.
    expect(monthGrid(2026, 1)[0]).toEqual([null, null, null, null, null, null, '2026-02-01'])
  })
})

describe('dayStatus', () => {
  it('compares a day with the goal', () => {
    expect(dayStatus(undefined, 2000)).toBe('empty')
    expect(dayStatus(1500, 2000)).toBe('low')
    expect(dayStatus(2150, 2000)).toBe('good')
    expect(dayStatus(2300, 2000)).toBe('high')
  })
})
