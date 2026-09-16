import { useState } from 'react'
import FoodSearchModal from './FoodSearchModal.tsx'
import type { FoodListItem } from '../hooks/useFoodRows.ts'
import type { FoodRow } from '../lib/foodRow.ts'
import {
  compatibleQuantityUnits,
  foodServingLabel,
  formatUnitLabel,
} from '../lib/units.ts'
import type { QuantityUnit } from '../types/food.ts'

type RecipeFoodRowsFieldProps = {
  rows: FoodRow[]
  foods: FoodListItem[]
  onAddFood: (food: FoodListItem) => void
  onCreateNewFood: (query: string) => void
  onAmountChange: (id: string, amount: string) => void
  onUnitChange: (id: string, unit: QuantityUnit) => void
  onRemoveRow: (id: string) => void
}

function RecipeFoodRowsField({
  rows,
  foods,
  onAddFood,
  onCreateNewFood,
  onAmountChange,
  onUnitChange,
  onRemoveRow,
}: RecipeFoodRowsFieldProps) {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <>
      {rows.map((row) => (
        <div className="meal-food-row" key={row.id}>
          <span className="meal-food-name">{row.foodSnapshot?.name}</span>
          <input
            type="number"
            placeholder="Amount"
            aria-label="Amount"
            value={row.amount}
            onChange={(e) => onAmountChange(row.id, e.target.value)}
          />
          <select
            aria-label="Unit"
            value={row.unit}
            onChange={(e) =>
              onUnitChange(row.id, e.target.value as QuantityUnit)
            }
          >
            {(row.foodSnapshot ? compatibleQuantityUnits(row.foodSnapshot) : []).map(
              (u) => (
                <option key={u} value={u}>
                  {u === 'serving' && row.foodSnapshot
                    ? foodServingLabel(row.foodSnapshot.servingSize)
                    : formatUnitLabel(u)}
                </option>
              ),
            )}
          </select>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onRemoveRow(row.id)}
            aria-label={`Remove ${row.foodSnapshot?.name || 'food'}`}
          >
            &times;
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={() => setSearchOpen(true)}
      >
        + Add ingredient
      </button>

      <FoodSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        foods={foods}
        onSelect={onAddFood}
        onCreateNew={onCreateNewFood}
      />
    </>
  )
}

export default RecipeFoodRowsField
