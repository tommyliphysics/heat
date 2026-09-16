import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReceiptReviewModal from './ReceiptReviewModal.tsx'
import type { ReceiptReviewRow } from '../lib/receiptMatch.ts'
import type { FoodListItem } from '../hooks/useFoodRows.ts'

function makeFood(overrides: Partial<FoodListItem> = {}): FoodListItem {
  return {
    id: 'food-1',
    name: 'Milk',
    quantity: { amount: '1', unit: 'L' },
    energy: { amount: '60', unit: 'cal' },
    macronutrients: {
      carbs: { amount: '5', unit: 'g' },
      fat: { amount: '3', unit: 'g' },
      protein: { amount: '3', unit: 'g' },
    },
    micronutrients: {},
    price: { amount: '2', currency: 'USD', retailer: '' },
    ...overrides,
  }
}

function makeRow(overrides: Partial<ReceiptReviewRow> = {}): ReceiptReviewRow {
  return {
    id: 'row-1',
    status: 'new',
    kind: 'food',
    name: '',
    amount: '1',
    unit: '',
    price: '2.50',
    ...overrides,
  }
}

function renderModal(overrides: {
  rows?: ReceiptReviewRow[]
  foods?: FoodListItem[]
  otherItemNames?: string[]
} = {}) {
  return render(
    <ReceiptReviewModal
      open
      onClose={vi.fn()}
      initialRows={overrides.rows ?? [makeRow({ kind: 'food' })]}
      retailer={null}
      foods={overrides.foods ?? [makeFood()]}
      otherItemNames={overrides.otherItemNames ?? []}
      onConfirm={vi.fn()}
    />,
  )
}

describe('ReceiptReviewModal — food row uses a search autocomplete, not a dropdown', () => {
  it('renders a search input for a food-kind row, not a <select>', () => {
    renderModal()

    expect(screen.getByPlaceholderText('Search foods or recipes...')).toBeInTheDocument()
    expect(screen.queryByText('Select a food')).not.toBeInTheDocument()
  })

  it('filters and selects a matching food, updating the row', async () => {
    const user = userEvent.setup()
    renderModal({ foods: [makeFood(), makeFood({ id: 'food-2', name: 'Oat Milk' })] })

    await user.type(screen.getByPlaceholderText('Search foods or recipes...'), 'oat')
    const option = await screen.findByRole('button', { name: 'Oat Milk' })
    await user.click(option)

    expect(screen.getByDisplayValue('Oat Milk')).toBeInTheDocument()
  })

  it('shows a plain empty message instead of "+ New Food" when nothing matches', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByPlaceholderText('Search foods or recipes...'), 'zzz-no-match')

    expect(await screen.findByText('No matching foods.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new food/i })).not.toBeInTheDocument()
  })
})

describe('ReceiptReviewModal — "Other" row also gets a search autocomplete', () => {
  it('suggests existing "Other" inventory item names while typing', async () => {
    const user = userEvent.setup()
    renderModal({
      rows: [makeRow({ kind: 'other', name: '' })],
      otherItemNames: ['Garbage Bags', 'Aluminium Foil'],
    })

    const nameInput = screen.getByLabelText('Name')
    await user.type(nameInput, 'garb')

    expect(await screen.findByRole('button', { name: 'Garbage Bags' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aluminium Foil' })).not.toBeInTheDocument()
  })

  it('fills the name field when a suggestion is clicked', async () => {
    const user = userEvent.setup()
    renderModal({
      rows: [makeRow({ kind: 'other', name: '' })],
      otherItemNames: ['Garbage Bags'],
    })

    await user.type(screen.getByLabelText('Name'), 'garb')
    await user.click(await screen.findByRole('button', { name: 'Garbage Bags' }))

    expect(screen.getByLabelText('Name')).toHaveValue('Garbage Bags')
  })

  it('allows a name with no matching suggestion — no error state, no dropdown', async () => {
    const user = userEvent.setup()
    renderModal({
      rows: [makeRow({ kind: 'other', name: '' })],
      otherItemNames: ['Garbage Bags'],
    })

    await user.type(screen.getByLabelText('Name'), 'Brand New Thing')

    expect(screen.getByLabelText('Name')).toHaveValue('Brand New Thing')
    expect(screen.queryByRole('button', { name: 'Garbage Bags' })).not.toBeInTheDocument()
  })
})

describe('ReceiptReviewModal — toggling kind keeps the typed/matched name', () => {
  it('keeps the name when switching from "Other" to "Food item"', async () => {
    const user = userEvent.setup()
    renderModal({ rows: [makeRow({ kind: 'other', name: 'Oat Milk' })] })

    await user.click(screen.getByRole('button', { name: 'Food item' }))

    expect(screen.getByPlaceholderText('Search foods or recipes...')).toHaveValue('Oat Milk')
  })

  it('keeps the name when switching from "Food item" to "Other"', async () => {
    const user = userEvent.setup()
    renderModal({
      rows: [makeRow({ kind: 'food', name: 'Milk', foodId: 'food-1' })],
    })

    await user.click(screen.getByRole('button', { name: 'Other' }))

    expect(screen.getByLabelText('Name')).toHaveValue('Milk')
  })

  it('still requires re-picking a food after toggling to "Food item" — a preserved name alone does not make the row submittable', async () => {
    const user = userEvent.setup()
    renderModal({ rows: [makeRow({ kind: 'other', name: 'Oat Milk' })] })

    await user.click(screen.getByRole('button', { name: 'Food item' }))

    expect(screen.getByRole('button', { name: /to Inventory$/ })).toBeDisabled()
  })
})
