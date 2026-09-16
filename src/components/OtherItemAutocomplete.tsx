import { useState } from 'react'
import { matchesQuery } from '../lib/search.ts'

type OtherItemAutocompleteProps = {
  id: string
  /** Distinct names of existing "Other"-kind inventory items to suggest from. */
  names: string[]
  value: string
  onChange: (value: string) => void
}

/**
 * A free-text name field with suggestions from existing "Other" inventory
 * item names — unlike `FoodAutocomplete`, there's no id to select (an
 * "Other" batch has no foreign key, just a name), so typing a name that
 * isn't suggested is always valid: it just means a new item. Picking a
 * suggestion instead keeps naming consistent with what's already tracked,
 * which is what makes future receipt-item matching (see
 * `lib/receiptMatch.ts`) actually find it next time.
 */
function OtherItemAutocomplete({ id, names, value, onChange }: OtherItemAutocompleteProps) {
  const [open, setOpen] = useState(false)

  const trimmed = value.trim()
  const results = trimmed
    ? names.filter(
        (name) => name.toLowerCase() !== trimmed.toLowerCase() && matchesQuery(name, trimmed),
      )
    : []

  function handleSelect(name: string) {
    onChange(name)
    setOpen(false)
  }

  return (
    <div className="food-autocomplete">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        autoComplete="off"
      />

      {open && results.length > 0 && (
        <div className="food-autocomplete-menu">
          <ul className="food-search-results">
            {results.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(name)}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default OtherItemAutocomplete
