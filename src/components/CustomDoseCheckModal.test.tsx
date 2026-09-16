import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CustomDoseCheckModal from './CustomDoseCheckModal.tsx'
import { fakeUser, setCurrentUser } from '../test/authFake.ts'
import { readCollection } from '../test/firestoreFake.ts'
import { occurrenceLogId } from '../lib/customSchedule.ts'
import type { CustomDoseLogDocument, DoseListItem } from '../types/doses.ts'

const uid = 'test-uid'
const now = new Date('2026-09-05T12:00:00')

function makeDose(overrides: Partial<DoseListItem> = {}): DoseListItem {
  return {
    id: 'dose-1',
    name: 'Melatonin',
    dose: '5mg',
    dosesPerDay: '1',
    scheduleType: 'custom',
    customSchedule: [
      { id: 'entry-1', date: '2026-09-05', time: '08:00', doseCount: '1' },
      { id: 'entry-2', date: '2026-09-06', time: '08:00', doseCount: '2' },
    ],
    ...overrides,
  }
}

/** The modal renders a `<Link>` (see CustomDoseCheckModal.tsx's edit-dose header action), which needs a router context to render at all. */
function renderModal(props: Partial<React.ComponentProps<typeof CustomDoseCheckModal>> = {}) {
  return render(
    <MemoryRouter>
      <CustomDoseCheckModal
        open
        onClose={() => {}}
        dose={makeDose()}
        logsByOccurrenceId={new Map()}
        now={now}
        {...props}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
})

describe('CustomDoseCheckModal', () => {
  it('renders overdue occurrences and the next upcoming one', () => {
    renderModal()

    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByText(/next:/i)).toHaveTextContent('2 doses')
  })

  it('checking an overdue occurrence writes it taken and deducts inventory', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('checkbox'))

    const logs = readCollection(`users/${uid}/customDoseLogs`) as unknown as (CustomDoseLogDocument & {
      id: string
    })[]
    const id = occurrenceLogId('dose-1', 'entry-1', 0)
    expect(logs.find((l) => l.id === id)).toMatchObject({ taken: true })
  })

  it('shows no scheduled doses when the dose has no occurrences', () => {
    renderModal({ dose: makeDose({ customSchedule: [] }) })

    expect(screen.getByText('No scheduled doses.')).toBeInTheDocument()
  })
})
