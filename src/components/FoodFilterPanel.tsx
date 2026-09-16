import type { FoodFilters, FoodRangeFilterKey } from '../lib/foodFilters.ts'

type FoodFilterPanelProps = {
  /** Draft values being edited — not applied to the food list until "Apply" is clicked. */
  filters: FoodFilters
  onChange: (filters: FoodFilters) => void
  onApply: () => void
  onClear: () => void
  /** Currency symbol to label the Cost field with, or null when foods mix currencies. */
  costUnit: string | null
}

function FoodFilterPanel({
  filters,
  onChange,
  onApply,
  onClear,
  costUnit,
}: FoodFilterPanelProps) {
  function updateRange(
    key: FoodRangeFilterKey,
    field: 'min' | 'max',
    value: string,
  ) {
    onChange({ ...filters, [key]: { ...filters[key], [field]: value } })
  }

  function rangeRow(key: FoodRangeFilterKey, label: string) {
    return (
      <div className="filter-row" key={key}>
        <label>{label}</label>
        <div className="filter-range">
          <input
            type="number"
            aria-label={`Min ${label}`}
            placeholder="Min"
            value={filters[key].min}
            onChange={(e) => updateRange(key, 'min', e.target.value)}
          />
          <input
            type="number"
            aria-label={`Max ${label}`}
            placeholder="Max"
            value={filters[key].max}
            onChange={(e) => updateRange(key, 'max', e.target.value)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="auth-form">
      <h2 className="form-section-heading">Filter Foods</h2>

      {rangeRow('cost', costUnit ? `Cost (${costUnit})` : 'Cost')}

      <div className="filter-row">
        <label>
          Energy
          <span className="filter-unit-toggle">
            <button
              type="button"
              className={`filter-unit-option${filters.energyUnit === 'cal' ? ' active' : ''}`}
              onClick={() => onChange({ ...filters, energyUnit: 'cal' })}
            >
              cal
            </button>
            <button
              type="button"
              className={`filter-unit-option${filters.energyUnit === 'kJ' ? ' active' : ''}`}
              onClick={() => onChange({ ...filters, energyUnit: 'kJ' })}
            >
              kJ
            </button>
          </span>
        </label>
        <div className="filter-range">
          <input
            type="number"
            aria-label="Min Energy"
            placeholder="Min"
            value={filters.energy.min}
            onChange={(e) => updateRange('energy', 'min', e.target.value)}
          />
          <input
            type="number"
            aria-label="Max Energy"
            placeholder="Max"
            value={filters.energy.max}
            onChange={(e) => updateRange('energy', 'max', e.target.value)}
          />
        </div>
      </div>

      {rangeRow('fat', 'Fat (g)')}
      {rangeRow('protein', 'Protein (g)')}
      {rangeRow('carbs', 'Carbohydrates (g)')}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          Clear Filters
        </button>
        <button type="button" className="btn btn-primary" onClick={onApply}>
          Apply
        </button>
      </div>
    </div>
  )
}

export default FoodFilterPanel
