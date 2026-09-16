import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import DailyDosesPage from './DailyDosesPage.tsx'
import { fakeUser, setCurrentUser } from '../test/authFake.ts'
import { readCollection, seedCollection } from '../test/firestoreFake.ts'
import { toDateStr } from '../lib/timeline.ts'
import type { CustomDoseLogDocument, DoseDocument } from '../types/doses.ts'

const uid = 'test-uid'
const todayStr = toDateStr(new Date())

function seedCustomDose(id: string, overrides: Partial<DoseDocument> = {}) {
  seedCollection(`users/${uid}/doses`, {
    [id]: {
      name: 'Melatonin',
      dose: '5mg',
      scheduleType: 'custom',
      createdAt: Date.now(),
      customSchedule: [],
      ...overrides,
    },
  })
}

function seedDose(id: string, overrides: Partial<DoseDocument> = {}) {
  seedCollection(`users/${uid}/doses`, {
    [id]: {
      name: 'Vitamin D',
      dose: '1000 IU',
      dosesPerDay: '1',
      // A freshly-created dose has no missed-dose history to scan — set
      // explicitly so these tests aren't affected by the missed-doses
      // fallback lookback window (see lib/missedDoses.ts).
      createdAt: Date.now(),
      ...overrides,
    },
  })
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
})

function renderPage() {
  return render(
    <MemoryRouter>
      <DailyDosesPage />
    </MemoryRouter>,
  )
}

/** Shows the `:doseId` route param, so a click-through to Edit Dose can be asserted on. */
function EditDoseProbe() {
  const { doseId } = useParams()
  return <p>editing: {doseId}</p>
}

function renderPageWithEditRoute() {
  return render(
    <MemoryRouter initialEntries={['/doses']}>
      <Routes>
        <Route path="/doses" element={<DailyDosesPage />} />
        <Route path="/doses/:doseId/edit" element={<EditDoseProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DailyDosesPage', () => {
  it('shows an empty state when there are no doses', () => {
    renderPage()

    expect(screen.getByText('No doses added yet.')).toBeInTheDocument()
  })

  it('lists a dose with its name, amount, and untaken status when there is no log for today', () => {
    seedDose('dose-1')

    renderPage()

    expect(screen.getByText('Vitamin D')).toBeInTheDocument()
    expect(screen.getByText('1000 IU')).toBeInTheDocument()
    expect(screen.getByLabelText('Not taken today')).toBeInTheDocument()
  })

  it('shows a taken dose as checked off', () => {
    seedDose('dose-1')
    seedCollection(`users/${uid}/doseLogs`, {
      [`dose-1_${todayStr}`]: { doseId: 'dose-1', date: todayStr, taken: [true] },
    })

    renderPage()

    expect(screen.queryByLabelText('Not taken today')).not.toBeInTheDocument()
  })

  it('opens the check-off modal when a dose row is clicked, and checking a dose writes today’s log', async () => {
    const user = userEvent.setup()
    seedDose('dose-1', { name: 'Vitamin D', dosesPerDay: '1' })

    renderPage()

    await user.click(screen.getByText('Vitamin D'))

    const modal = await screen.findByRole('dialog')
    const checkbox = within(modal).getByRole('checkbox', { name: /dose 1/i })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    expect(checkbox).toBeChecked()
    expect(readCollection(`users/${uid}/doseLogs`)).toEqual([
      { id: `dose-1_${todayStr}`, doseId: 'dose-1', date: todayStr, taken: [true] },
    ])
  })

  it('navigates to the edit page (and not the check-off modal) when the edit button is clicked', async () => {
    const user = userEvent.setup()
    seedDose('dose-1', { name: 'Vitamin D' })

    renderPageWithEditRoute()

    await user.click(screen.getByRole('button', { name: 'Edit Vitamin D' }))

    expect(await screen.findByText('editing: dose-1')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders a custom-schedule dose alongside recurring doses and opens its own check-off modal', async () => {
    const user = userEvent.setup()
    seedDose('dose-1')
    seedCustomDose('dose-2', {
      customSchedule: [{ id: 'entry-1', date: '2099-01-01', time: '08:00', doseCount: '1' }],
    })

    renderPage()

    expect(screen.getByText('Vitamin D')).toBeInTheDocument()
    expect(screen.getByText('Melatonin')).toBeInTheDocument()

    await user.click(screen.getByText('Melatonin'))

    const modal = await screen.findByRole('dialog')
    expect(within(modal).getByText(/next:/i)).toBeInTheDocument()
  })

  it('merges a missed custom occurrence into the Missed Dose table, and Mark Taken logs it', async () => {
    const user = userEvent.setup()
    seedCustomDose('dose-2', {
      customSchedule: [{ id: 'entry-1', date: '2020-01-01', time: '08:00', doseCount: '1' }],
    })

    renderPage()

    await screen.findAllByText('Melatonin')
    const missedRow = screen.getAllByText('Melatonin').find((el) => el.closest('.missed-dose-row'))!
      .closest('tr')!
    await user.click(within(missedRow).getByRole('button', { name: 'Mark Taken' }))

    const logs = readCollection(`users/${uid}/customDoseLogs`) as unknown as (CustomDoseLogDocument & {
      id: string
    })[]
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ doseId: 'dose-2', entryId: 'entry-1', occurrenceIndex: 0, taken: true })
  })
})
