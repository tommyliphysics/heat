import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MyFoodsPage from './MyFoodsPage.tsx'
import { fakeUser, setCurrentUser } from '../test/authFake.ts'
import { seedCollection } from '../test/firestoreFake.ts'
import type { FoodDocument } from '../types/food.ts'

const uid = 'test-uid'

function makeFood(overrides: Partial<FoodDocument> = {}): FoodDocument {
  return {
    name: 'Flour',
    quantity: { amount: '1', unit: 'kg' },
    energy: { amount: '3640', unit: 'cal' },
    macronutrients: {
      carbs: { amount: '76', unit: 'g' },
      fat: { amount: '1', unit: 'g' },
      protein: { amount: '10', unit: 'g' },
    },
    micronutrients: {},
    price: { amount: '2.5', currency: 'USD', retailer: 'Store' },
    ...overrides,
  }
}

function seedFood(id: string, overrides: Partial<FoodDocument> = {}) {
  seedCollection(`users/${uid}/foods`, { [id]: makeFood(overrides) })
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
})

function renderPage() {
  return render(
    <MemoryRouter>
      <MyFoodsPage />
    </MemoryRouter>,
  )
}

describe('MyFoodsPage', () => {
  it('shows an empty state when there are no foods', () => {
    renderPage()

    expect(screen.getByText('No foods added yet.')).toBeInTheDocument()
  })

  it('lists foods from the mocked collection with their name and brand', () => {
    seedFood('flour-1', { name: 'Flour', brand: 'Baker’s Choice' })
    seedFood('sugar-1', { name: 'Sugar', brand: 'Sweet Co' })

    renderPage()

    expect(screen.getByText('Flour [Baker’s Choice]')).toBeInTheDocument()
    expect(screen.getByText('Sugar [Sweet Co]')).toBeInTheDocument()
  })

  it('filters the list as the search input is typed', async () => {
    const user = userEvent.setup()
    seedFood('flour-1', { name: 'Flour' })
    seedFood('sugar-1', { name: 'Sugar' })

    renderPage()

    await user.type(screen.getByLabelText('Search foods'), 'flour')

    expect(screen.getByText('Flour')).toBeInTheDocument()
    expect(screen.queryByText('Sugar')).not.toBeInTheDocument()
  })

  it('shows a no-match message when the search excludes every food', async () => {
    const user = userEvent.setup()
    seedFood('flour-1', { name: 'Flour' })

    renderPage()

    await user.type(screen.getByLabelText('Search foods'), 'nonexistent')

    expect(
      screen.getByText('No foods match your search and filters.'),
    ).toBeInTheDocument()
  })

  it('links to the Add Food page', () => {
    renderPage()

    expect(screen.getByRole('link', { name: /add food/i })).toHaveAttribute(
      'href',
      '/add-food',
    )
  })
})
