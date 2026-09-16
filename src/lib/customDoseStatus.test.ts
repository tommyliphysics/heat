import { describe, expect, it } from 'vitest'
import { computeCustomDoseStatus, computeMissedOccurrences } from './customDoseStatus.ts'
import { occurrenceLogId } from './customSchedule.ts'
import type { CustomDoseLogDocument, CustomScheduleEntry, DoseListItem } from '../types/doses.ts'

const NOW = new Date('2026-09-05T12:00:00')

function makeEntry(overrides: Partial<CustomScheduleEntry> = {}): CustomScheduleEntry {
  return {
    id: 'entry-1',
    date: '2026-09-05',
    time: '09:00',
    doseCount: '1',
    ...overrides,
  }
}

function makeDose(overrides: Partial<DoseListItem> = {}): DoseListItem {
  return {
    id: 'dose-1',
    name: 'Vitamin D',
    dose: '1000 IU',
    dosesPerDay: '1',
    scheduleType: 'custom',
    customSchedule: [makeEntry()],
    ...overrides,
  }
}

function logMap(logs: CustomDoseLogDocument[]): Map<string, CustomDoseLogDocument> {
  return new Map(logs.map((log) => [occurrenceLogId(log.doseId, log.entryId, log.occurrenceIndex), log]))
}

describe('computeCustomDoseStatus', () => {
  it('returns none for a dose with no schedule entries', () => {
    const dose = makeDose({ customSchedule: [] })
    expect(computeCustomDoseStatus(dose, new Map(), NOW)).toEqual({ kind: 'none' })
  })

  it('returns upcoming for a future occurrence', () => {
    const dose = makeDose({ customSchedule: [makeEntry({ time: '18:00' })] })
    const status = computeCustomDoseStatus(dose, new Map(), NOW)
    expect(status.kind).toBe('upcoming')
  })

  it('returns missed for a past, un-taken occurrence', () => {
    const dose = makeDose({ customSchedule: [makeEntry({ time: '08:00' })] })
    const status = computeCustomDoseStatus(dose, new Map(), NOW)
    expect(status.kind).toBe('missed')
  })

  it('returns taken once the only occurrence is logged as taken', () => {
    const dose = makeDose({ customSchedule: [makeEntry({ time: '08:00' })] })
    const logs = logMap([
      { doseId: 'dose-1', entryId: 'entry-1', occurrenceIndex: 0, scheduledAt: 0, taken: true },
    ])
    expect(computeCustomDoseStatus(dose, logs, NOW)).toEqual({ kind: 'taken' })
  })

  it('skips a cleared occurrence and moves to the next outstanding one', () => {
    const dose = makeDose({
      customSchedule: [makeEntry({ time: '08:00' }), makeEntry({ id: 'entry-2', time: '18:00' })],
    })
    const logs = logMap([
      { doseId: 'dose-1', entryId: 'entry-1', occurrenceIndex: 0, scheduledAt: 0, taken: false, cleared: true },
    ])
    const status = computeCustomDoseStatus(dose, logs, NOW)
    expect(status.kind).toBe('upcoming')
    if (status.kind === 'upcoming') expect(status.occurrence.entryId).toBe('entry-2')
  })
})

describe('computeMissedOccurrences', () => {
  it('flags a past un-taken, non-cleared occurrence', () => {
    const dose = makeDose({ customSchedule: [makeEntry({ time: '08:00' })] })
    const missed = computeMissedOccurrences([dose], new Map(), NOW)
    expect(missed).toHaveLength(1)
    expect(missed[0]).toMatchObject({ doseId: 'dose-1', entryId: 'entry-1', occurrenceIndex: 0 })
  })

  it('does not flag a future occurrence', () => {
    const dose = makeDose({ customSchedule: [makeEntry({ time: '18:00' })] })
    expect(computeMissedOccurrences([dose], new Map(), NOW)).toEqual([])
  })

  it('does not flag a taken occurrence', () => {
    const dose = makeDose({ customSchedule: [makeEntry({ time: '08:00' })] })
    const logs = logMap([
      { doseId: 'dose-1', entryId: 'entry-1', occurrenceIndex: 0, scheduledAt: 0, taken: true },
    ])
    expect(computeMissedOccurrences([dose], logs, NOW)).toEqual([])
  })

  it('does not flag a cleared occurrence', () => {
    const dose = makeDose({ customSchedule: [makeEntry({ time: '08:00' })] })
    const logs = logMap([
      { doseId: 'dose-1', entryId: 'entry-1', occurrenceIndex: 0, scheduledAt: 0, taken: false, cleared: true },
    ])
    expect(computeMissedOccurrences([dose], logs, NOW)).toEqual([])
  })

  it('sorts by occurrence time', () => {
    const doseA = makeDose({ id: 'dose-a', name: 'A', customSchedule: [makeEntry({ time: '10:00' })] })
    const doseB = makeDose({ id: 'dose-b', name: 'B', customSchedule: [makeEntry({ time: '08:00' })] })
    const missed = computeMissedOccurrences([doseA, doseB], new Map(), NOW)
    expect(missed.map((m) => m.doseId)).toEqual(['dose-b', 'dose-a'])
  })
})
