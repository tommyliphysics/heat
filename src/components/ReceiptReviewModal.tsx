import { useEffect, useState } from 'react'
import FoodAutocomplete from './FoodAutocomplete.tsx'
import Icon from './Icon.tsx'
import Modal from './Modal.tsx'
import OtherItemAutocomplete from './OtherItemAutocomplete.tsx'
import { CURRENCIES } from '../data/currencies.ts'
import type { FoodListItem } from '../hooks/useFoodRows.ts'
import { makeBlankReceiptRow, type ReceiptReviewRow } from '../lib/receiptMatch.ts'
import { toDateStr } from '../lib/timeline.ts'
import { ALL_QUANTITY_UNITS, compatibleQuantityUnits, formatUnitLabel } from '../lib/units.ts'
import type { InventoryBatchDocument, QuantityUnit } from '../types/food.ts'

type ReceiptReviewModalProps = {
  open: boolean
  onClose: () => void
  initialRows: ReceiptReviewRow[]
  retailer: string | null
  foods: FoodListItem[]
  /** Distinct names of existing "Other"-kind inventory items, for `OtherItemAutocomplete`'s suggestions. */
  otherItemNames: string[]
  onConfirm: (batches: InventoryBatchDocument[]) => Promise<void>
}

const MATCH_LABEL: Record<ReceiptReviewRow['status'], string | null> = {
  food: 'Found in My Foods',
  other: 'Found in Inventory (Other)',
  new: null,
}

function ReceiptReviewModal({
  open,
  onClose,
  initialRows,
  retailer,
  foods,
  otherItemNames,
  onConfirm,
}: ReceiptReviewModalProps) {
  const [rows, setRows] = useState<ReceiptReviewRow[]>(initialRows)
  const [purchasedAt, setPurchasedAt] = useState(toDateStr(new Date()))
  const [currency, setCurrency] = useState('USD')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setRows(initialRows)
      setPurchasedAt(toDateStr(new Date()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function updateRow(id: string, patch: Partial<ReceiptReviewRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function handleKindChange(row: ReceiptReviewRow, kind: 'food' | 'other') {
    // Keep `name` as typed/matched — switching kind shouldn't throw away
    // what the user already has, and it's a useful head start either way
    // (a search hint for FoodAutocomplete, or the final name as-is for
    // "Other"). `foodId` still resets: an old selection from before the
    // toggle would otherwise silently keep pointing at that food. Requiring
    // an explicit (re-)pick rather than defaulting to some food is what
    // actually guards against misattributing this purchase — see
    // `validRows`, which keeps a 'food' row out until `foodId` is set,
    // regardless of what `name` displays.
    updateRow(row.id, { kind, foodId: undefined, status: 'new' })
  }

  function handleFoodChange(row: ReceiptReviewRow, foodId: string) {
    const food = foods.find((f) => f.id === foodId)
    updateRow(row.id, { foodId, name: food?.name ?? row.name })
  }

  function handleDelete(id: string) {
    setRows((current) => current.filter((row) => row.id !== id))
  }

  function handleAddBlankRow() {
    setRows((current) => [...current, makeBlankReceiptRow()])
  }

  const validRows = rows.filter(
    (row) =>
      row.name.trim() &&
      row.amount &&
      row.price &&
      (row.kind !== 'food' || row.foodId),
  )

  async function handleConfirm() {
    if (validRows.length === 0) return
    setSaving(true)
    try {
      const batches: InventoryBatchDocument[] = validRows.map((row) =>
        row.kind === 'food'
          ? {
              kind: 'food',
              foodId: row.foodId,
              foodName: row.name.trim(),
              amount: row.amount,
              unit: row.unit,
              price: row.price,
              currency,
              purchasedAt,
            }
          : {
              kind: 'other',
              foodName: row.name.trim(),
              retailer: retailer ?? undefined,
              amount: row.amount,
              unit: row.unit,
              price: row.price,
              currency,
              purchasedAt,
            },
      )
      await onConfirm(batches)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="receipt-review-title"
      title="Review Receipt"
    >
      {retailer && <p className="receipt-review-retailer">Retailer: {retailer}</p>}

      {rows.length === 0 ? (
        <p>No items found on this receipt.</p>
      ) : (
        <ul className="receipt-review-list">
          {rows.map((row) => {
            const matchLabel = MATCH_LABEL[row.status]
            const selectedFood = row.foodId
              ? (foods.find((f) => f.id === row.foodId) ?? null)
              : null
            const unitOptions =
              row.kind === 'food' && selectedFood
                ? compatibleQuantityUnits(selectedFood)
                : ALL_QUANTITY_UNITS

            return (
              <li key={row.id} className="receipt-review-row">
                <div className="receipt-review-row-header">
                  {matchLabel && (
                    <span className="receipt-review-match-label">{matchLabel}</span>
                  )}
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label={`Remove ${row.name || 'item'}`}
                    onClick={() => handleDelete(row.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>

                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-option${row.kind === 'food' ? ' active' : ''}`}
                    onClick={() => handleKindChange(row, 'food')}
                  >
                    Food item
                  </button>
                  <button
                    type="button"
                    className={`toggle-option${row.kind === 'other' ? ' active' : ''}`}
                    onClick={() => handleKindChange(row, 'other')}
                  >
                    Other
                  </button>
                </div>

                {row.kind === 'food' ? (
                  <>
                    <label htmlFor={`receipt-food-${row.id}`}>Food</label>
                    <FoodAutocomplete
                      foods={foods}
                      recipes={[]}
                      selectedName={row.name}
                      onSelectFood={(foodId) => handleFoodChange(row, foodId)}
                      onSelectRecipe={() => {}}
                      onCreateNew={() => {}}
                      allowCreate={false}
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor={`receipt-name-${row.id}`}>Name</label>
                    <OtherItemAutocomplete
                      id={`receipt-name-${row.id}`}
                      names={otherItemNames}
                      value={row.name}
                      onChange={(name) => updateRow(row.id, { name })}
                    />
                  </>
                )}

                <label htmlFor={`receipt-amount-${row.id}`}>Amount</label>
                <div className="unit-row">
                  <input
                    id={`receipt-amount-${row.id}`}
                    type="number"
                    value={row.amount}
                    onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                  />
                  <select
                    aria-label={`Unit for ${row.name || 'item'}`}
                    value={row.unit}
                    onChange={(e) =>
                      updateRow(row.id, { unit: e.target.value as QuantityUnit })
                    }
                  >
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>
                        {formatUnitLabel(u)}
                      </option>
                    ))}
                  </select>
                </div>

                <label htmlFor={`receipt-price-${row.id}`}>Price</label>
                <input
                  id={`receipt-price-${row.id}`}
                  type="number"
                  step="0.01"
                  value={row.price}
                  onChange={(e) => updateRow(row.id, { price: e.target.value })}
                />
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" className="btn btn-secondary btn-full" onClick={handleAddBlankRow}>
        <Icon name="plus" size={16} />
        Add Item
      </button>

      <label htmlFor="receipt-currency">Currency</label>
      <select
        id="receipt-currency"
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} ({c.symbol})
          </option>
        ))}
      </select>

      <label htmlFor="receipt-date">Purchased on</label>
      <input
        id="receipt-date"
        type="date"
        value={purchasedAt}
        onChange={(e) => setPurchasedAt(e.target.value)}
      />

      <button
        type="button"
        className="btn btn-primary btn-full"
        disabled={validRows.length === 0 || saving}
        onClick={handleConfirm}
      >
        {saving
          ? 'Adding...'
          : `Add ${validRows.length || ''} Item${validRows.length === 1 ? '' : 's'} to Inventory`}
      </button>
    </Modal>
  )
}

export default ReceiptReviewModal
