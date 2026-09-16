import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DoseAlertBanners from './DoseAlertBanners.tsx'
import { fakeUser, setCurrentUser } from '../test/authFake.ts'
import { seedCollection } from '../test/firestoreFake.ts'
import type { DoseDocument } from '../types/doses.ts'

const uid = 'test-uid'

function seedDose(id: string, overrides: Partial<DoseDocument> = {}) {
  seedCollection(`users/${uid}/doses`, {
    [id]: {
      name: 'Vitamin D',
      dose: '1000 IU',
      dosesPerDay: '1',
      createdAt: Date.now(),
      ...overrides,
    },
  })
}

function renderBanners() {
  return render(
    <MemoryRouter>
      <DoseAlertBanners />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DoseAlertBanners — untimed doses default to an end-of-day countdown', () => {
  it('shows a countdown alert near end of day for a dose with no configured time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T23:10:00'))
    seedDose('dose-1')

    renderBanners()

    expect(
      screen.getByRole('link', { name: /vitamin d due/i }),
    ).toBeInTheDocument()
  })

  it('does not show a countdown alert outside the last hour of the day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T12:00:00'))
    seedDose('dose-1')

    renderBanners()

    expect(
      screen.queryByRole('link', { name: /vitamin d due/i }),
    ).not.toBeInTheDocument()
  })

  it('does not show a countdown alert once the untimed dose was taken today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T23:10:00'))
    seedDose('dose-1')
    seedCollection(`users/${uid}/doseLogs`, {
      'dose-1_2026-08-31': { doseId: 'dose-1', date: '2026-08-31', taken: [true] },
    })

    renderBanners()

    expect(
      screen.queryByRole('link', { name: /vitamin d due/i }),
    ).not.toBeInTheDocument()
  })

  it('still uses the dose’s own configured time when one is set, rather than the end-of-day default', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T07:30:00'))
    seedDose('dose-1', { doseTimes: ['08:00'] })

    renderBanners()

    expect(
      screen.getByRole('link', { name: /vitamin d due/i }),
    ).toBeInTheDocument()
  })
})

describe('DoseAlertBanners — today’s own overdue dose', () => {
  it('shows a missed-dose banner once today’s scheduled time has passed, any time of day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T21:00:00'))
    seedDose('dose-1', { doseTimes: ['08:00'] })

    renderBanners()

    expect(
      screen.getByRole('link', { name: /missed dose: vitamin d/i }),
    ).toBeInTheDocument()
  })

  it('does not show a missed-dose banner before today’s scheduled time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T07:00:00'))
    seedDose('dose-1', { doseTimes: ['08:00'] })

    renderBanners()

    expect(
      screen.queryByRole('link', { name: /missed dose: vitamin d/i }),
    ).not.toBeInTheDocument()
  })

  it('does not show a missed-dose banner once the overdue dose is taken', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T21:00:00'))
    seedDose('dose-1', { doseTimes: ['08:00'] })
    seedCollection(`users/${uid}/doseLogs`, {
      'dose-1_2026-08-31': { doseId: 'dose-1', date: '2026-08-31', taken: [true] },
    })

    renderBanners()

    expect(
      screen.queryByRole('link', { name: /missed dose: vitamin d/i }),
    ).not.toBeInTheDocument()
  })
})
