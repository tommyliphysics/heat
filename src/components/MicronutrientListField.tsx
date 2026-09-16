import type { Micronutrient, MicronutrientUnit } from '../types/food.ts'

type MicronutrientListFieldProps = {
  micronutrients: Micronutrient[]
  onAdd: () => void
  onChange: (id: string, field: 'name' | 'amount', value: string) => void
  onUnitChange: (id: string, unit: MicronutrientUnit) => void
  onRemove: (id: string) => void
}

function MicronutrientListField({
  micronutrients,
  onAdd,
  onChange,
  onUnitChange,
  onRemove,
}: MicronutrientListFieldProps) {
  return (
    <>
      {micronutrients.map((m) => (
        <div className="micronutrient-row" key={m.id}>
          <input
            type="text"
            placeholder="Micronutrient"
            aria-label="Micronutrient name"
            value={m.name}
            onChange={(e) => onChange(m.id, 'name', e.target.value)}
          />
          <input
            type="text"
            placeholder="Amount"
            aria-label="Micronutrient amount"
            value={m.amount}
            onChange={(e) => onChange(m.id, 'amount', e.target.value)}
          />
          <select
            aria-label="Micronutrient unit"
            value={m.unit}
            onChange={(e) => onUnitChange(m.id, e.target.value as MicronutrientUnit)}
          >
            <option value="g">g</option>
            <option value="mg">mg</option>
            <option value="ug">μg</option>
          </select>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onRemove(m.id)}
            aria-label={`Remove ${m.name || 'micronutrient'}`}
          >
            &times;
          </button>
        </div>
      ))}

      <button type="button" className="btn btn-secondary btn-full" onClick={onAdd}>
        + Add micronutrient
      </button>
    </>
  )
}

export default MicronutrientListField
