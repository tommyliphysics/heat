import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MicronutrientListField from './MicronutrientListField.tsx'
import type { Micronutrient } from '../types/food.ts'

function makeMicronutrient(overrides: Partial<Micronutrient> = {}): Micronutrient {
  return {
    id: 'vitamin-c',
    name: 'Vitamin C',
    amount: '90',
    unit: 'mg',
    ...overrides,
  }
}

describe('MicronutrientListField', () => {
  it('renders one row per micronutrient with its current values', () => {
    render(
      <MicronutrientListField
        micronutrients={[
          makeMicronutrient(),
          makeMicronutrient({ id: 'iron', name: 'Iron', amount: '8', unit: 'mg' }),
        ]}
        onAdd={vi.fn()}
        onChange={vi.fn()}
        onUnitChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getAllByLabelText('Micronutrient name')).toHaveLength(2)
    expect(screen.getByDisplayValue('Vitamin C')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Iron')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Vitamin C' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Iron' })).toBeInTheDocument()
  })

  it('calls onChange with the row id, field, and new value when typing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MicronutrientListField
        micronutrients={[makeMicronutrient({ amount: '' })]}
        onAdd={vi.fn()}
        onChange={onChange}
        onUnitChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Micronutrient amount'), '9')

    expect(onChange).toHaveBeenCalledWith('vitamin-c', 'amount', '9')
  })

  it('calls onUnitChange when a different unit is selected', async () => {
    const user = userEvent.setup()
    const onUnitChange = vi.fn()
    render(
      <MicronutrientListField
        micronutrients={[makeMicronutrient()]}
        onAdd={vi.fn()}
        onChange={vi.fn()}
        onUnitChange={onUnitChange}
        onRemove={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Micronutrient unit'), 'ug')

    expect(onUnitChange).toHaveBeenCalledWith('vitamin-c', 'ug')
  })

  it('calls onRemove with the row id when its remove button is clicked', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(
      <MicronutrientListField
        micronutrients={[makeMicronutrient()]}
        onAdd={vi.fn()}
        onChange={vi.fn()}
        onUnitChange={vi.fn()}
        onRemove={onRemove}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Vitamin C' }))

    expect(onRemove).toHaveBeenCalledWith('vitamin-c')
  })

  it('calls onAdd when "+ Add micronutrient" is clicked', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(
      <MicronutrientListField
        micronutrients={[]}
        onAdd={onAdd}
        onChange={vi.fn()}
        onUnitChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+ Add micronutrient' }))

    expect(onAdd).toHaveBeenCalledOnce()
  })
})
