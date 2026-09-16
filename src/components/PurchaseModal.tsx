import { useState } from 'react'
import Modal from './Modal.tsx'
import { CURRENCIES, getCurrencySymbol } from '../data/currencies.ts'
import { matchesQuery } from '../lib/search.ts'
import {
  compatibleQuantityUnits,
  foodServingLabel,
  formatQuantityLabel,
  formatUnitLabel,
} from '../lib/units.ts'
import type { PriceRecord, QuantityUnit } from '../types/food.ts'

type PurchaseModalProps = {
  open: boolean
  onClose: () => void
  retailer: string
  onRetailerChange: (value: string) => void
  price: string
  onPriceChange: (value: string) => void
  quantity: string
  onQuantityChange: (value: string) => void
  quantityUnit: QuantityUnit
  onQuantityUnitChange: (unit: QuantityUnit) => void
  /** The food's own nutrition quantity — determines which units (weight/volume/serving) can be picked here. */
  nutritionQuantity: string
  nutritionQuantityUnit: QuantityUnit
  servingSize: string
  currency: string
  onCurrencyChange: (value: string) => void
  prices: PriceRecord[]
  onSelectPriceRecord: (record: PriceRecord) => void
}

function PurchaseModal({
  open,
  onClose,
  retailer,
  onRetailerChange,
  price,
  onPriceChange,
  quantity,
  onQuantityChange,
  quantityUnit,
  onQuantityUnitChange,
  nutritionQuantity,
  nutritionQuantityUnit,
  servingSize,
  currency,
  onCurrencyChange,
  prices,
  onSelectPriceRecord,
}: PurchaseModalProps) {
  const [retailerSearchOpen, setRetailerSearchOpen] = useState(false)

  const trimmedRetailer = retailer.trim()
  const retailerResults = prices.filter((p) =>
    trimmedRetailer ? matchesQuery(p.retailer, trimmedRetailer) : true,
  )
  const quantityUnitOptions = compatibleQuantityUnits({
    quantity: { amount: nutritionQuantity, unit: nutritionQuantityUnit },
    servingSize,
  })

  function handleSelectRetailer(record: PriceRecord) {
    onSelectPriceRecord(record)
    setRetailerSearchOpen(false)
  }

  return (
    <Modal open={open} onClose={onClose} titleId="purchase-title" title="Price">
      <label htmlFor="retailer">Retailer</label>
      <div className="food-autocomplete">
        <input
          id="retailer"
          type="text"
          value={retailer}
          onChange={(e) => {
            onRetailerChange(e.target.value)
            setRetailerSearchOpen(true)
          }}
          onFocus={() => setRetailerSearchOpen(true)}
          onBlur={() => setRetailerSearchOpen(false)}
          autoComplete="off"
        />

        {retailerSearchOpen && retailerResults.length > 0 && (
          <div className="food-autocomplete-menu">
            <ul className="food-search-results">
              {retailerResults.map((record) => (
                <li key={record.retailer}>
                  <button
                    type="button"
                    className="retailer-search-result"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectRetailer(record)}
                  >
                    <span>{record.retailer}</span>
                    <span className="retailer-search-result-price">
                      {getCurrencySymbol(record.currency)}
                      {Number(record.amount).toFixed(2)}
                      {record.quantity &&
                        `/${formatQuantityLabel(record.quantity.amount, record.quantity.unit, servingSize)}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <label htmlFor="price">Price</label>
      <div className="unit-row">
        <input
          id="price"
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
        />
        <select
          aria-label="Currency"
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} ({c.symbol})
            </option>
          ))}
        </select>
      </div>

      <label htmlFor="purchase-quantity">Quantity</label>
      <div className="unit-row">
        <input
          id="purchase-quantity"
          type="number"
          value={quantity}
          onChange={(e) => onQuantityChange(e.target.value)}
        />
        <select
          aria-label="Purchase quantity unit"
          value={quantityUnit}
          onChange={(e) => onQuantityUnitChange(e.target.value as QuantityUnit)}
        >
          {quantityUnitOptions.map((u) => (
            <option key={u} value={u}>
              {u === 'serving' ? foodServingLabel(servingSize) : formatUnitLabel(u)}
            </option>
          ))}
        </select>
      </div>

      <button type="button" className="btn btn-primary" onClick={onClose}>
        Done
      </button>
    </Modal>
  )
}

export default PurchaseModal
