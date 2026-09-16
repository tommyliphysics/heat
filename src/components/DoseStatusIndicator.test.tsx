import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import DoseStatusIndicator from './DoseStatusIndicator.tsx'
import { formatCountdown, formatTimeOfDay } from '../lib/doseStatus.ts'

const now = new Date('2026-08-29T12:00:00')

describe('DoseStatusIndicator', () => {
  it('renders a check icon when taken', () => {
    const { container } = render(
      <DoseStatusIndicator status={{ kind: 'taken' }} now={now} />,
    )

    expect(container.querySelector('svg.shopping-check-icon')).toBeInTheDocument()
  })

  it('renders a plain dot when untaken with no scheduled time', () => {
    render(<DoseStatusIndicator status={{ kind: 'untaken' }} now={now} />)

    expect(screen.getByLabelText('Not taken today')).toBeInTheDocument()
  })

  it('renders a countdown to the scheduled time when upcoming', () => {
    const status = { kind: 'upcoming' as const, time: '14:30', index: 0 }
    render(<DoseStatusIndicator status={status} now={now} />)

    expect(screen.getByText(formatCountdown(status.time, now))).toBeInTheDocument()
  })

  it('renders the frozen scheduled time when missed', () => {
    const status = { kind: 'missed' as const, time: '08:00', index: 0 }
    render(<DoseStatusIndicator status={status} now={now} />)

    expect(screen.getByText(formatTimeOfDay(status.time))).toBeInTheDocument()
  })
})
