import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ShoppingListTable from './ShoppingListTable.tsx'
import type { ShoppingListEntry } from '../lib/report.ts'

function makeEntry(overrides: Partial<ShoppingListEntry> = {}): ShoppingListEntry {
  return {
    foodId: 'flour-1',
    name: 'Flour',
    totalGrams: 500,
    totalMilliliters: 0,
    totalCount: 0,
    totalPrice: 3.5,
    currency: 'USD',
    ...overrides,
  }
}

/** Shows whatever `focusFoodId` the row navigation carried, so a click can be asserted on. */
function InventoryProbe() {
  const location = useLocation()
  const state = location.state as { focusFoodId?: string } | null
  return <p>focusFoodId: {state?.focusFoodId ?? 'none'}</p>
}

function renderWithRouter(entries: ShoppingListEntry[]) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ShoppingListTable entries={entries} />} />
        <Route path="/inventory" element={<InventoryProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ShoppingListTable', () => {
  it('shows an empty message when there are no entries', () => {
    renderWithRouter([])

    expect(screen.getByText('No foods in this period.')).toBeInTheDocument()
  })

  it('renders each entry’s name, quantity, and price', () => {
    renderWithRouter([makeEntry()])

    expect(screen.getByText('Flour')).toBeInTheDocument()
    expect(screen.getByText('500 g')).toBeInTheDocument()
    expect(screen.getByText('$3.50')).toBeInTheDocument()
  })

  it('navigates to Inventory with the clicked row’s foodId', async () => {
    const user = userEvent.setup()
    renderWithRouter([makeEntry({ foodId: 'flour-1', name: 'Flour' })])

    await user.click(screen.getByText('Flour'))

    expect(await screen.findByText('focusFoodId: flour-1')).toBeInTheDocument()
  })
})
