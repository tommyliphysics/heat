import type { EnergyUnit } from '../types/food.ts'

type EnergyToggleProps = {
  amount: number
  unit: EnergyUnit
  onToggle: () => void
  className?: string
}

/** A read-only energy amount that switches between cal and kJ when clicked. */
function EnergyToggle({ amount, unit, onToggle, className }: EnergyToggleProps) {
  return (
    <button
      type="button"
      className={className ? `energy-toggle ${className}` : 'energy-toggle'}
      onClick={onToggle}
      aria-label={`${Math.round(amount)} ${unit}, click to switch units`}
    >
      {Math.round(amount)} {unit}
    </button>
  )
}

export default EnergyToggle
