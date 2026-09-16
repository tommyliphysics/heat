import { describe, expect, it } from 'vitest'
import { EMPTY_DOSE_FORM_VALUES, buildDoseDocument, doseDocumentToFormValues, type DoseFormValues } from './doses.ts'
import type { CustomScheduleEntry, DoseDocument } from '../types/doses.ts'

function makeValues(overrides: Partial<DoseFormValues> = {}): DoseFormValues {
  return { ...EMPTY_DOSE_FORM_VALUES, name: 'Vitamin D', ...overrides }
}

function makeEntry(overrides: Partial<CustomScheduleEntry> = {}): CustomScheduleEntry {
  return { id: 'entry-1', date: '2026-09-02', time: '09:00', doseCount: '2', ...overrides }
}

describe('buildDoseDocument — recurring', () => {
  it('never writes scheduleType for a recurring dose', () => {
    const doc = buildDoseDocument(makeValues({ dosesPerDay: '2', doseTimes: ['08:00', '20:00'] }))
    expect(doc.scheduleType).toBeUndefined()
    expect(doc.dosesPerDay).toBe('2')
    expect(doc.doseTimes).toEqual(['08:00', '20:00'])
  })

  it('omits doseTimes entirely when every slot is blank', () => {
    const doc = buildDoseDocument(makeValues({ dosesPerDay: '2', doseTimes: ['', ''] }))
    expect(doc.doseTimes).toBeUndefined()
  })
})

describe('buildDoseDocument — custom', () => {
  it('writes scheduleType and customSchedule, omitting doseTimes', () => {
    const doc = buildDoseDocument(
      makeValues({ scheduleType: 'custom', customSchedule: [makeEntry()], doseTimes: ['08:00'] }),
    )
    expect(doc.scheduleType).toBe('custom')
    expect(doc.doseTimes).toBeUndefined()
    expect(doc.customSchedule).toHaveLength(1)
  })

  it('drops entries missing a date, time, or dose count', () => {
    const doc = buildDoseDocument(
      makeValues({
        scheduleType: 'custom',
        customSchedule: [makeEntry(), makeEntry({ id: 'entry-2', date: '' })],
      }),
    )
    expect(doc.customSchedule).toHaveLength(1)
  })

  it('keeps the same id for an entry whose timing is unchanged from the previous save', () => {
    const previous = [makeEntry()]
    const doc = buildDoseDocument(
      makeValues({ scheduleType: 'custom', customSchedule: [makeEntry()] }),
      previous,
    )
    expect(doc.customSchedule?.[0].id).toBe('entry-1')
  })

  it('mints a new id for an entry whose date/time/doseCount/repeat changed from the previous save', () => {
    const previous = [makeEntry()]
    const doc = buildDoseDocument(
      makeValues({ scheduleType: 'custom', customSchedule: [makeEntry({ time: '10:00' })] }),
      previous,
    )
    expect(doc.customSchedule?.[0].id).not.toBe('entry-1')
  })

  it('does not mint a new id for a brand new entry with no previous counterpart', () => {
    const doc = buildDoseDocument(
      makeValues({ scheduleType: 'custom', customSchedule: [makeEntry()] }),
      [],
    )
    expect(doc.customSchedule?.[0].id).toBe('entry-1')
  })

  it('mints a new id when a repeat rule is added to a previously non-repeating entry', () => {
    const previous = [makeEntry()]
    const doc = buildDoseDocument(
      makeValues({
        scheduleType: 'custom',
        customSchedule: [
          makeEntry({ repeat: { everyValue: '1', everyUnit: 'hours', forValue: '1', forUnit: 'days' } }),
        ],
      }),
      previous,
    )
    expect(doc.customSchedule?.[0].id).not.toBe('entry-1')
  })
})

describe('doseDocumentToFormValues', () => {
  it('defaults scheduleType to recurring when absent', () => {
    const record: DoseDocument = { name: 'Vitamin D', dose: '', dosesPerDay: '1' }
    expect(doseDocumentToFormValues(record).scheduleType).toBe('recurring')
  })

  it('round-trips a custom schedule', () => {
    const record: DoseDocument = {
      name: 'Vitamin D',
      dose: '',
      scheduleType: 'custom',
      customSchedule: [makeEntry()],
    }
    const values = doseDocumentToFormValues(record)
    expect(values.scheduleType).toBe('custom')
    expect(values.customSchedule).toEqual([makeEntry()])
  })
})
