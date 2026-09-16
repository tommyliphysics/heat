import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DoseForm from './DoseForm.tsx'

function fillName(user: ReturnType<typeof userEvent.setup>) {
  return user.type(screen.getByLabelText('Name'), 'Vitamin D')
}

describe('DoseForm — schedule type toggle', () => {
  it('shows the recurring fields by default and switches to the custom schedule editor', async () => {
    const user = userEvent.setup()
    render(
      <DoseForm title="Add Dose" submitLabel="Add" savingLabel="Adding..." onSubmit={vi.fn()} />,
    )

    expect(screen.getByLabelText('Doses per day')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add schedule entry/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Custom schedule' }))

    expect(screen.queryByLabelText('Doses per day')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add schedule entry/i })).toBeInTheDocument()
  })
})

describe('DoseForm — custom schedule entries', () => {
  async function openCustomSchedule(user: ReturnType<typeof userEvent.setup>) {
    render(
      <DoseForm title="Add Dose" submitLabel="Add" savingLabel="Adding..." onSubmit={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Custom schedule' }))
  }

  it('adds and removes a schedule entry', async () => {
    const user = userEvent.setup()
    await openCustomSchedule(user)

    await user.click(screen.getByRole('button', { name: /add schedule entry/i }))
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
    expect(screen.getByLabelText('Time')).toBeInTheDocument()
    expect(screen.getByLabelText('Doses')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /remove schedule entry 1/i }))
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()
  })

  it('reveals repeat fields once "Repeat" is checked', async () => {
    const user = userEvent.setup()
    await openCustomSchedule(user)
    await user.click(screen.getByRole('button', { name: /add schedule entry/i }))

    expect(screen.queryByLabelText('Repeat every')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Repeat' }))

    expect(screen.getByLabelText('Repeat every')).toBeInTheDocument()
    expect(screen.getByLabelText('Repeat for')).toBeInTheDocument()
  })

  it('shows a validation error and does not submit when no entries are added', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <DoseForm title="Add Dose" submitLabel="Add" savingLabel="Adding..." onSubmit={onSubmit} />,
    )
    await fillName(user)
    await user.click(screen.getByRole('button', { name: 'Custom schedule' }))

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Add at least one schedule entry.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows a validation error when an entry is missing its date/time', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <DoseForm title="Add Dose" submitLabel="Add" savingLabel="Adding..." onSubmit={onSubmit} />,
    )
    await fillName(user)
    await user.click(screen.getByRole('button', { name: 'Custom schedule' }))
    await user.click(screen.getByRole('button', { name: /add schedule entry/i }))

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Each schedule entry needs a date and time.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits a valid custom schedule', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <DoseForm title="Add Dose" submitLabel="Add" savingLabel="Adding..." onSubmit={onSubmit} />,
    )
    await fillName(user)
    await user.click(screen.getByRole('button', { name: 'Custom schedule' }))
    await user.click(screen.getByRole('button', { name: /add schedule entry/i }))
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-02' } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:00' } })

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSubmit).toHaveBeenCalledOnce()
    const values = onSubmit.mock.calls[0][0]
    expect(values.scheduleType).toBe('custom')
    expect(values.customSchedule).toEqual([
      expect.objectContaining({ date: '2026-09-02', time: '09:00', doseCount: '1' }),
    ])
  })
})
