import { useEffect, useState } from 'react'
import Modal from './Modal.tsx'
import { CURRENCIES } from '../data/currencies.ts'
import { formatUnitLabel } from '../lib/units.ts'
import type { QuantityUnit } from '../types/food.ts'

const UNIT_OPTIONS: QuantityUnit[] = ['', 'g', 'kg', 'lb', 'oz', 'mL', 'L', 'qt', 'fl oz']

export type NewShoppingItem = {
  name: string
  amount: string
  unit: QuantityUnit
  price: string
  currency: string
}

type AddShoppingItemModalProps = {
  open: boolean
  onClose: () => void
  onAdd: (item: NewShoppingItem) => Promise<void>
  defaultCurrency: string
}

function AddShoppingItemModal({
  open,
  onClose,
  onAdd,
  defaultCurrency,
}: AddShoppingItemModalProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<QuantityUnit>('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setCurrency(defaultCurrency)
  }, [open, defaultCurrency])

  function reset() {
    setName('')
    setAmount('')
    setUnit('')
    setPrice('')
    setCurrency(defaultCurrency)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onAdd({ name, amount, unit, price, currency })
      reset()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      titleId="add-shopping-item-title"
      title="Add Item"
    >
      <label htmlFor="shopping-item-name">Name</label>
      <input
        id="shopping-item-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label htmlFor="shopping-item-amount">Amount</label>
      <div className="unit-row">
        <input
          id="shopping-item-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select
          aria-label="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value as QuantityUnit)}
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {formatUnitLabel(u)}
            </option>
          ))}
        </select>
      </div>

      <label htmlFor="shopping-item-price">Price</label>
      <div className="unit-row">
        <input
          id="shopping-item-price"
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <select
          aria-label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} ({c.symbol})
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-full"
        disabled={!name.trim() || saving}
        onClick={handleSubmit}
      >
        {saving ? 'Adding...' : 'Add Item'}
      </button>
    </Modal>
  )
}

export default AddShoppingItemModal
