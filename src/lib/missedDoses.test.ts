import { describe, expect, it } from 'vitest'
import { computeMissedDoses } from './missedDoses.ts'
import { addDays, toDateStr } from './timeline.ts'
import type { DoseListItem, DoseLogDocument } from '../types/doses.ts'

const todayStr = toDateStr(new Date())

function makeDose(overrides: Partial<DoseListItem> = {}): DoseListItem {
  return {
    id: 'dose-1',
    name: 'Vitamin D',
    dose: '1000 IU',
    dosesPerDay: '1',
    createdAt: new Date(addDays(todayStr, -5)).getTime(),
    ...overrides,
  }
}

function logsMap(logs: DoseLogDocument[]): Map<string, DoseLogDocument> {
  return new Map(logs.map((log) => [`${log.doseId}_${log.date}`, log]))
}

describe('computeMissedDoses', () => {
  it('flags every day since creation with no log at all as missed', () => {
    const dose = makeDose({ createdAt: new Date(addDays(todayStr, -2)).getTime() })

    const missed = computeMissedDoses([dose], logsMap([]), todayStr)

    expect(missed.map((m) => m.date)).toEqual([
      addDays(todayStr, -2),
      addDays(todayStr, -1),
    ])
  })

  it('never flags today, even with no log', () => {
    const dose = makeDose()

    const missed = computeMissedDoses([dose], logsMap([]), todayStr)

    expect(missed.some((m) => m.date === todayStr)).toBe(false)
  })

  it('does not flag a day where every dose slot was taken', () => {
    const dose = makeDose({ dosesPerDay: '2', createdAt: new Date(addDays(todayStr, -1)).getTime() })
    const day = addDays(todayStr, -1)

    const missed = computeMissedDoses(
      [dose],
      logsMap([{ doseId: dose.id, date: day, taken: [true, true] }]),
      todayStr,
    )

    expect(missed).toEqual([])
  })

  it('flags a day where only some of multiple daily doses were taken', () => {
    const dose = makeDose({ dosesPerDay: '2', createdAt: new Date(addDays(todayStr, -1)).getTime() })
    const day = addDays(todayStr, -1)

    const missed = computeMissedDoses(
      [dose],
      logsMap([{ doseId: dose.id, date: day, taken: [true, false] }]),
      todayStr,
    )

    expect(missed).toHaveLength(1)
    expect(missed[0].date).toBe(day)
    expect(missed[0].taken).toEqual([true, false])
  })

  it('does not flag a day that has been explicitly cleared, even if incomplete', () => {
    const dose = makeDose({ createdAt: new Date(addDays(todayStr, -1)).getTime() })
    const day = addDays(todayStr, -1)

    const missed = computeMissedDoses(
      [dose],
      logsMap([{ doseId: dose.id, date: day, taken: [false], cleared: true }]),
      todayStr,
    )

    expect(missed).toEqual([])
  })

  it('never flags a day before the dose was created', () => {
    const dose = makeDose({ createdAt: new Date(todayStr).getTime() })

    const missed = computeMissedDoses([dose], logsMap([]), todayStr)

    expect(missed).toEqual([])
  })

  it('only checks yesterday for a dose saved before createdAt existed, not a long backlog', () => {
    const dose = makeDose({ createdAt: undefined })

    const missed = computeMissedDoses([dose], logsMap([]), todayStr)

    // No real record exists for older days (the app never tracked them),
    // so it starts tracking from yesterday rather than asserting a backlog.
    expect(missed.map((m) => m.date)).toEqual([addDays(todayStr, -1)])
  })
})
