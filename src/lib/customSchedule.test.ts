import { describe, expect, it } from 'vitest'
import {
  MAX_OCCURRENCES_PER_ENTRY,
  generateDoseOccurrences,
  generateEntryOccurrences,
  occurrenceLogId,
} from './customSchedule.ts'
import type { CustomScheduleEntry, DoseListItem } from '../types/doses.ts'

function makeEntry(overrides: Partial<CustomScheduleEntry> = {}): CustomScheduleEntry {
  return {
    id: 'entry-1',
    date: '2026-09-02',
    time: '09:00',
    doseCount: '2',
    ...overrides,
  }
}

function makeDose(overrides: Partial<DoseListItem> = {}): DoseListItem {
  return {
    id: 'dose-1',
    name: 'Vitamin D',
    dose: '1000 IU',
    dosesPerDay: '1',
    ...overrides,
  }
}

describe('generateEntryOccurrences', () => {
  it('returns a single occurrence for an entry with no repeat', () => {
    const occurrences = generateEntryOccurrences(makeEntry())

    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({ entryId: 'entry-1', occurrenceIndex: 0, doseCount: 2 })
    expect(new Date(occurrences[0].at).toISOString()).toBe(
      new Date(2026, 8, 2, 9, 0, 0, 0).toISOString(),
    )
  })

  it('repeats every N days for M days, inclusive of both ends', () => {
    const entry = makeEntry({
      repeat: { everyValue: '1', everyUnit: 'days', forValue: '2', forUnit: 'days' },
    })

    const occurrences = generateEntryOccurrences(entry)

    expect(occurrences.map((o) => o.occurrenceIndex)).toEqual([0, 1, 2])
    expect(occurrences.map((o) => new Date(o.at).getDate())).toEqual([2, 3, 4])
  })

  it('repeats every N hours, crossing midnight into the next calendar date', () => {
    const entry = makeEntry({
      time: '20:00',
      repeat: { everyValue: '6', everyUnit: 'hours', forValue: '18', forUnit: 'hours' },
    })

    const occurrences = generateEntryOccurrences(entry)

    // 20:00, 02:00 (+1 day), 08:00 (+1 day), 14:00 (+1 day)
    expect(occurrences).toHaveLength(4)
    const dates = occurrences.map((o) => new Date(o.at))
    expect(dates[0].getDate()).toBe(2)
    expect(dates[0].getHours()).toBe(20)
    expect(dates[1].getDate()).toBe(3)
    expect(dates[1].getHours()).toBe(2)
    expect(dates[3].getDate()).toBe(3)
    expect(dates[3].getHours()).toBe(14)
  })

  it('repeats every N minutes', () => {
    const entry = makeEntry({
      time: '09:00',
      repeat: { everyValue: '30', everyUnit: 'minutes', forValue: '1', forUnit: 'hours' },
    })

    const occurrences = generateEntryOccurrences(entry)

    expect(occurrences.map((o) => new Date(o.at).getMinutes())).toEqual([0, 30, 0])
    expect(occurrences).toHaveLength(3)
  })

  it('degrades to a single occurrence when everyValue is zero or blank, instead of looping forever', () => {
    const entry = makeEntry({
      repeat: { everyValue: '0', everyUnit: 'hours', forValue: '5', forUnit: 'days' },
    })

    const occurrences = generateEntryOccurrences(entry)

    expect(occurrences).toHaveLength(1)
    expect(occurrences[0].occurrenceIndex).toBe(0)
  })

  it('caps enumeration at MAX_OCCURRENCES_PER_ENTRY for a pathological repeat config', () => {
    const entry = makeEntry({
      repeat: { everyValue: '1', everyUnit: 'minutes', forValue: '365', forUnit: 'days' },
    })

    const occurrences = generateEntryOccurrences(entry)

    expect(occurrences).toHaveLength(MAX_OCCURRENCES_PER_ENTRY)
  })
})

describe('generateDoseOccurrences', () => {
  it('returns an empty array for a recurring dose', () => {
    expect(generateDoseOccurrences(makeDose())).toEqual([])
  })

  it('returns an empty array for a custom dose with no schedule entries', () => {
    expect(generateDoseOccurrences(makeDose({ scheduleType: 'custom' }))).toEqual([])
  })

  it('flattens and sorts occurrences across multiple entries', () => {
    const dose = makeDose({
      scheduleType: 'custom',
      customSchedule: [
        makeEntry({ id: 'b', date: '2026-09-04', time: '09:00' }),
        makeEntry({ id: 'a', date: '2026-09-02', time: '09:00' }),
      ],
    })

    const occurrences = generateDoseOccurrences(dose)

    expect(occurrences.map((o) => o.entryId)).toEqual(['a', 'b'])
  })
})

describe('occurrenceLogId', () => {
  it('builds the deterministic doc id', () => {
    expect(occurrenceLogId('dose-1', 'entry-1', 2)).toBe('dose-1_custom_entry-1_2')
  })
})
