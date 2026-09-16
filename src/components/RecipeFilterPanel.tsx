import type { RangeFilterKey, RecipeFilters } from '../lib/recipeFilters.ts'

type RecipeFilterPanelProps = {
  /** Draft values being edited — not applied to the recipe list until "Apply" is clicked. */
  filters: RecipeFilters
  onChange: (filters: RecipeFilters) => void
  onApply: () => void
  onClear: () => void
  /** Currency symbol to label the Cost field with, or null when recipes mix currencies. */
  costUnit: string | null
}

function RecipeFilterPanel({
  filters,
  onChange,
  onApply,
  onClear,
  costUnit,
}: RecipeFilterPanelProps) {
  function updateRange(
    key: RangeFilterKey,
    field: 'min' | 'max',
    value: string,
  ) {
    onChange({ ...filters, [key]: { ...filters[key], [field]: value } })
  }

  function rangeRow(key: RangeFilterKey, label: string) {
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
      <h2 className="form-section-heading">Filter Recipes</h2>

      <div className="toggle-group">
        <button
          type="button"
          className={`toggle-option${filters.basis === 'perServe' ? ' active' : ''}`}
          onClick={() => onChange({ ...filters, basis: 'perServe' })}
        >
          Per Serve
        </button>
        <button
          type="button"
          className={`toggle-option${filters.basis === 'total' ? ' active' : ''}`}
          onClick={() => onChange({ ...filters, basis: 'total' })}
        >
          Total
        </button>
      </div>

      {rangeRow('handsOnTime', 'Hands-on Time (min)')}
      {rangeRow('prepTime', 'Prep Time (min)')}
      {rangeRow('cookTime', 'Cook Time (min)')}
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

export default RecipeFilterPanel
