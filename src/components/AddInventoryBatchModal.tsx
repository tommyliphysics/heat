import { useEffect, useState } from 'react'
import FoodAutocomplete from './FoodAutocomplete.tsx'
import Modal from './Modal.tsx'
import { CURRENCIES } from '../data/currencies.ts'
import type { FoodListItem } from '../hooks/useFoodRows.ts'
import { toDateStr } from '../lib/timeline.ts'
import {
  ALL_QUANTITY_UNITS,
  compatibleQuantityUnits,
  foodServingLabel,
  formatUnitLabel,
} from '../lib/units.ts'
import type { InventoryBatchDocument, QuantityUnit } from '../types/food.ts'

/**
 * Pre-fills a batch from the food's "Quantity" (in the Price section) — how
 * much its recorded price actually buys, i.e. one item/package's worth —
 * and that same recorded price, so adding a whole retail item to inventory
 * doesn't require hand-computing amount × price.
 */
function autoLoadFromFood(food: FoodListItem): {
  amount: string
  unit: QuantityUnit
  price: string
  currency: string
} {
  const quantity = food.price.quantity ?? food.quantity
  return {
    amount: quantity.amount,
    unit: quantity.unit,
    price: food.price.amount,
    currency: food.price.currency || 'USD',
  }
}

type InventoryKind = 'food' | 'other'

/** Pre-fills the "Other" side of the form when opened from a hand-typed Shopping List item — the item already recorded all of this, so re-typing it here would be pure duplication. */
export type InitialOtherBatch = {
  name: string
  amount: string
  unit: QuantityUnit
  price: string
  currency: string
}

type AddInventoryBatchModalProps = {
  open: boolean
  onClose: () => void
  foods: FoodListItem[]
  onAdd: (batch: InventoryBatchDocument) => Promise<void>
  onCreateNewFood: (query: string) => void
  /** Pre-selects a food when opened from the Shopping List's "go log this" link. */
  initialFoodId?: string | null
  /** Pre-fills a hand-typed ("Other") item when opened from the Shopping List's "go log this" link for a custom item. Ignored if `initialFoodId` is also set. */
  initialOther?: InitialOtherBatch | null
}

function AddInventoryBatchModal({
  open,
  onClose,
  foods,
  onAdd,
  onCreateNewFood,
  initialFoodId,
  initialOther,
}: AddInventoryBatchModalProps) {
  const [kind, setKind] = useState<InventoryKind>('food')
  const [foodId, setFoodId] = useState('')
  const [otherName, setOtherName] = useState('')
  const [retailer, setRetailer] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<QuantityUnit>('g')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [purchasedAt, setPurchasedAt] = useState(toDateStr(new Date()))
  const [saving, setSaving] = useState(false)

  const selectedFood = foods.find((f) => f.id === foodId) ?? null

  useEffect(() => {
    if (!open) return
    const initialFood = initialFoodId
      ? (foods.find((f) => f.id === initialFoodId) ?? null)
      : null

    if (initialFood) {
      const auto = autoLoadFromFood(initialFood)
      setKind('food')
      setFoodId(initialFood.id)
      setOtherName('')
      setAmount(auto.amount)
      setUnit(auto.unit)
      setPrice(auto.price)
      setCurrency(auto.currency)
    } else if (initialOther) {
      setKind('other')
      setFoodId('')
      setOtherName(initialOther.name)
      setAmount(initialOther.amount)
      setUnit(initialOther.unit)
      setPrice(initialOther.price)
      setCurrency(initialOther.currency)
    } else {
      setKind('food')
      setFoodId('')
      setOtherName('')
      setAmount('')
      setUnit('g')
      setPrice('')
      setCurrency('USD')
    }
    setRetailer('')
    setPurchasedAt(toDateStr(new Date()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFoodId, initialOther])

  function handleSelectKind(next: InventoryKind) {
    setKind(next)
    setAmount('')
    setUnit(next === 'other' ? '' : 'g')
    setPrice('')
  }

  function handleSelectFood(id: string) {
    setFoodId(id)
    const food = foods.find((f) => f.id === id)
    if (food) {
      const auto = autoLoadFromFood(food)
      setAmount(auto.amount)
      setUnit(auto.unit)
      setPrice(auto.price)
      setCurrency(auto.currency)
    }
  }

  function handleClose() {
    onClose()
  }

  const canSubmit =
    kind === 'food'
      ? !!selectedFood && !!amount && !!price
      : !!otherName.trim() && !!amount && !!price

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    try {
      await onAdd(
        kind === 'food'
          ? {
              kind: 'food',
              foodId: selectedFood!.id,
              foodName: selectedFood!.name,
              ...(selectedFood!.brand ? { brand: selectedFood!.brand } : {}),
              amount,
              unit,
              price,
              currency,
              purchasedAt,
            }
          : {
              kind: 'other',
              foodName: otherName.trim(),
              retailer: retailer.trim() || undefined,
              amount,
              unit,
              price,
              currency,
              purchasedAt,
            },
      )
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      titleId="add-inventory-batch-title"
      title="Add to Inventory"
    >
      <div className="toggle-group">
        <button
          type="button"
          className={`toggle-option${kind === 'food' ? ' active' : ''}`}
          onClick={() => handleSelectKind('food')}
        >
          Food item
        </button>
        <button
          type="button"
          className={`toggle-option${kind === 'other' ? ' active' : ''}`}
          onClick={() => handleSelectKind('other')}
        >
          Other
        </button>
      </div>

      {kind === 'food' ? (
        <>
          <label htmlFor="inventory-food">Food</label>
          <FoodAutocomplete
            foods={foods}
            recipes={[]}
            selectedName={selectedFood?.name ?? ''}
            onSelectFood={handleSelectFood}
            onSelectRecipe={() => {}}
            onCreateNew={onCreateNewFood}
          />
        </>
      ) : (
        <>
          <label htmlFor="inventory-other-name">Name</label>
          <input
            id="inventory-other-name"
            type="text"
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
          />

          <label htmlFor="inventory-retailer">Retailer</label>
          <input
            id="inventory-retailer"
            type="text"
            value={retailer}
            onChange={(e) => setRetailer(e.target.value)}
          />
        </>
      )}

      <label htmlFor="inventory-amount">Amount</label>
      <div className="unit-row">
        <input
          id="inventory-amount"
          type="number"
          value={amount}
          disabled={kind === 'food' && !selectedFood}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select
          aria-label="Unit"
          value={unit}
          disabled={kind === 'food' && !selectedFood}
          onChange={(e) => setUnit(e.target.value as QuantityUnit)}
        >
          {(kind === 'food'
            ? selectedFood
              ? compatibleQuantityUnits(selectedFood)
              : [unit]
            : ALL_QUANTITY_UNITS
          ).map((u) => (
            <option key={u} value={u}>
              {u === 'serving'
                ? foodServingLabel(selectedFood?.servingSize)
                : formatUnitLabel(u)}
            </option>
          ))}
        </select>
      </div>

      <label htmlFor="inventory-price">Price paid</label>
      <div className="unit-row">
        <input
          id="inventory-price"
          type="number"
          step="0.01"
          value={price}
          disabled={kind === 'food' && !selectedFood}
          onChange={(e) => setPrice(e.target.value)}
        />
        <select
          aria-label="Currency"
          value={currency}
          disabled={kind === 'food' && !selectedFood}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} ({c.symbol})
            </option>
          ))}
        </select>
      </div>

      <label htmlFor="inventory-date">Purchased on</label>
      <input
        id="inventory-date"
        type="date"
        value={purchasedAt}
        onChange={(e) => setPurchasedAt(e.target.value)}
      />

      <button
        type="button"
        className="btn btn-primary btn-full"
        disabled={!canSubmit || saving}
        onClick={handleSubmit}
      >
        {saving ? 'Adding...' : 'Add to Inventory'}
      </button>
    </Modal>
  )
}

export default AddInventoryBatchModal
