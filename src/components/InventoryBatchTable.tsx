import { useState, type CSSProperties } from 'react'
import { deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { getCurrencySymbol } from '../data/currencies.ts'
import { latestRemaining } from '../lib/inventory.ts'
import { formatShortDate } from '../lib/timeline.ts'
import {
  compatibleQuantityUnits,
  formatUnitLabel,
  quantityConversionFactor,
} from '../lib/units.ts'
import type { InventoryBatchItem, QuantityUnit } from '../types/food.ts'
import type { DateFormat } from '../types/settings.ts'
import Icon from './Icon.tsx'

/** What fraction of a batch's purchased amount is still remaining, as a 0-100 percentage for the pie indicator — the latest history entry and `amount` are always in the same unit, so this is a plain ratio, no conversion needed. Clamped in case remaining was ever set higher than what was bought. */
function remainingPercent(batch: Parameters<typeof latestRemaining>[0]): number {
  const amount = Number(batch.amount)
  if (!amount) return 0
  const remaining = Number(latestRemaining(batch))
  return Math.max(0, Math.min(100, (remaining / amount) * 100))
}

/** Rounds to a few decimal places, so converting units doesn't leave floating-point noise (e.g. "700.00000000001") in the remaining input. */
function roundForDisplay(num: number): number {
  return Math.round(num * 10000) / 10000
}

type InventoryBatchTableProps = {
  batches: InventoryBatchItem[]
  /** Firestore path segments to this table's batches' parent collection — `['users', uid, 'inventory']` for a personal table, `['groups', groupId, 'inventory']` for a group's shared one. Every write in this component targets `batchDocRef(batch.id)` below, so a group table's edits land in the same shared documents every member reads. */
  basePath: string[]
  dateFormat: DateFormat
  onViewHistory: (batch: InventoryBatchItem) => void
}

/**
 * One inventory table — Food/Amount/Remaining/Price/Purchased columns, with
 * inline remaining-amount editing. Used for both the personal Inventory
 * sections and each group's shared-inventory sections (see
 * `GroupInventorySection.tsx`); `basePath` is the only thing that changes
 * between them; the same edit here written to a group's `basePath` is
 * exactly how "totally synced" happens — every member's table points at
 * the same underlying documents, so there's no separate propagation step.
 */
function InventoryBatchTable({
  batches,
  basePath,
  dateFormat,
  onViewHistory,
}: InventoryBatchTableProps) {
  const [editingRemainingId, setEditingRemainingId] = useState<string | null>(null)
  const [remainingDraft, setRemainingDraft] = useState('')

  // `doc()` takes a single slash-joined path rather than `...basePath` spread
  // directly — `basePath` is a plain `string[]`, not a fixed-length tuple, so
  // TypeScript can't tell at the spread how many of `doc()`'s overloads it
  // could be matching and picks the wrong one (see build error history).
  function batchDocRef(batchId: string) {
    return doc(db, [...basePath, batchId].join('/'))
  }

  function currentRemainingValue(batch: InventoryBatchItem, unit: QuantityUnit): number {
    return roundForDisplay(
      Number(latestRemaining(batch)) * quantityConversionFactor(batch.unit, unit),
    )
  }

  async function handleUpdateRemaining(batch: InventoryBatchItem, value: string) {
    // The input is in `batch.remainingUnit`, but history entries are always
    // stored in `batch.unit` (see the type's doc comment) — convert before
    // appending so every other reader can keep assuming that.
    const displayUnit = batch.remainingUnit ?? batch.unit
    const stored = Number(value) * quantityConversionFactor(displayUnit, batch.unit)

    await updateDoc(batchDocRef(batch.id), {
      remainingHistory: [
        ...(batch.remainingHistory ?? []),
        { amount: String(stored), timestamp: Date.now() },
      ],
    })
  }

  function handleStartEditRemaining(batch: InventoryBatchItem, displayValue: number) {
    setEditingRemainingId(batch.id)
    setRemainingDraft(String(displayValue))
  }

  function handleCancelEditRemaining() {
    setEditingRemainingId(null)
    setRemainingDraft('')
  }

  async function handleSubmitRemaining(batch: InventoryBatchItem) {
    await handleUpdateRemaining(batch, remainingDraft)
    handleCancelEditRemaining()
  }

  async function handleUpdateRemainingUnit(
    batch: InventoryBatchItem,
    remainingUnit: QuantityUnit,
  ) {
    await updateDoc(batchDocRef(batch.id), { remainingUnit })

    // Re-express whatever's currently on record in the newly picked unit,
    // rather than leaving an in-progress draft typed in the old one sitting
    // there under a now-mismatched unit label.
    if (editingRemainingId === batch.id) {
      setRemainingDraft(String(currentRemainingValue(batch, remainingUnit)))
    }
  }

  async function handleDelete(batchId: string) {
    await deleteDoc(batchDocRef(batchId))
  }

  return (
    <div className="foods-table-wrap">
      <table className="foods-table">
        <thead>
          <tr>
            <th>Food</th>
            <th>Amount</th>
            <th>Remaining</th>
            <th>Price</th>
            <th>Purchased</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => {
            const remainingUnit = batch.remainingUnit ?? batch.unit
            const remainingUnitOptions = compatibleQuantityUnits({
              quantity: { amount: batch.amount, unit: batch.unit },
            })
            const remainingValue = currentRemainingValue(batch, remainingUnit)
            const isEditingRemaining = editingRemainingId === batch.id

            return (
              <tr key={batch.id}>
                <td>{batch.foodName}</td>
                <td className="cell-mono">
                  {batch.amount}
                  {formatUnitLabel(batch.unit)}
                </td>
                <td className="cell-mono">
                  <div className="inventory-remaining-cell">
                    <span
                      className="inventory-remaining-pie"
                      style={
                        { '--pct': `${remainingPercent(batch)}%` } as CSSProperties
                      }
                      role="img"
                      aria-label={`${Math.round(remainingPercent(batch))}% remaining`}
                    />
                    {isEditingRemaining ? (
                      <input
                        type="number"
                        className="inventory-remaining-input"
                        aria-label={`Remaining ${batch.foodName}`}
                        value={remainingDraft}
                        autoFocus
                        onChange={(e) => setRemainingDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSubmitRemaining(batch)
                          if (e.key === 'Escape') handleCancelEditRemaining()
                        }}
                      />
                    ) : (
                      <span className="inventory-remaining-value">
                        {remainingValue}
                      </span>
                    )}
                    {isEditingRemaining ? (
                      <select
                        className="inventory-remaining-unit-select"
                        aria-label={`Remaining unit for ${batch.foodName}`}
                        value={remainingUnit}
                        onChange={(e) =>
                          handleUpdateRemainingUnit(
                            batch,
                            e.target.value as QuantityUnit,
                          )
                        }
                      >
                        {remainingUnitOptions.map((u) => (
                          <option key={u} value={u}>
                            {formatUnitLabel(u)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inventory-remaining-unit-value">
                        {formatUnitLabel(remainingUnit)}
                      </span>
                    )}
                    {isEditingRemaining ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Save remaining ${batch.foodName}`}
                        onClick={() => handleSubmitRemaining(batch)}
                      >
                        <Icon name="check" size={14} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Edit remaining ${batch.foodName}`}
                        onClick={() => handleStartEditRemaining(batch, remainingValue)}
                      >
                        <Icon name="pencil" size={14} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="cell-mono">
                  {getCurrencySymbol(batch.currency)}
                  {Number(batch.price).toFixed(2)}
                </td>
                <td className="cell-mono">
                  {formatShortDate(batch.purchasedAt, dateFormat)}
                </td>
                <td className="shopping-row-delete">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`View history for ${batch.foodName}`}
                    onClick={() => onViewHistory(batch)}
                  >
                    <Icon name="clock" size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label={`Delete ${batch.foodName} batch`}
                    onClick={() => handleDelete(batch.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default InventoryBatchTable
