import { useRef, useState } from 'react'
import Icon from './Icon.tsx'
import { COMMON_KITCHEN_EQUIPMENT } from '../data/kitchenEquipment.ts'
import { matchesQuery } from '../lib/search.ts'

type EquipmentFieldProps = {
  items: string[]
  onChange: (items: string[]) => void
}

const MAX_SUGGESTIONS = 7

/** Suggestions matching `query`, already-selected items excluded, closest (starts-with) matches first, capped at `MAX_SUGGESTIONS`. */
function suggestionsFor(query: string, items: string[]): string[] {
  const lower = query.trim().toLowerCase()
  const selected = new Set(items.map((item) => item.toLowerCase()))

  return COMMON_KITCHEN_EQUIPMENT.filter(
    (name) => !selected.has(name.toLowerCase()) && matchesQuery(name, query),
  )
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(lower) ? 0 : 1
      const bStarts = b.toLowerCase().startsWith(lower) ? 0 : 1
      return aStarts - bStarts || a.localeCompare(b)
    })
    .slice(0, MAX_SUGGESTIONS)
}

/**
 * A single input that renders selected items as removable chips and offers
 * autocomplete suggestions (plus a "use exactly what I typed" fallback) for
 * new ones — modeled on a mail client's "To:" field. Clicking a chip's label
 * un-selects it and drops its text back into the input for editing; clicking
 * anywhere else in the field focuses the input so typing continues right
 * after the last chip.
 */
function EquipmentField({ items, onChange }: EquipmentFieldProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = query.trim()
  const suggestions = trimmed ? suggestionsFor(trimmed, items) : []
  // Hidden when the typed text already exactly names a suggestion on offer,
  // so the menu never shows two ways to add the literal same item.
  const showAddCustom =
    trimmed.length > 0 &&
    !suggestions.some((name) => name.toLowerCase() === trimmed.toLowerCase())

  function commit(name: string) {
    const value = name.trim()
    if (!value) return
    if (!items.some((item) => item.toLowerCase() === value.toLowerCase())) {
      onChange([...items, value])
    }
    setQuery('')
    setOpen(false)
  }

  function handleRemove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function handleEditChip(index: number) {
    setQuery(items[index])
    onChange(items.filter((_, i) => i !== index))
    setOpen(true)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0) commit(suggestions[0])
      else if (trimmed) commit(trimmed)
    } else if (e.key === 'Backspace' && query === '' && items.length > 0) {
      handleEditChip(items.length - 1)
    }
  }

  function handleBlur() {
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="equipment-field" onClick={() => inputRef.current?.focus()}>
      {items.map((item, index) => (
        <span className="equipment-chip" key={`${item}-${index}`}>
          <button
            type="button"
            className="equipment-chip-label"
            onClick={() => handleEditChip(index)}
          >
            {item}
          </button>
          <button
            type="button"
            className="equipment-chip-remove"
            aria-label={`Remove ${item}`}
            onClick={() => handleRemove(index)}
          >
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}

      <input
        ref={inputRef}
        type="text"
        className="equipment-field-input"
        aria-label="Required equipment"
        placeholder={items.length === 0 ? 'Search kitchen equipment...' : ''}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />

      {open && trimmed && (suggestions.length > 0 || showAddCustom) && (
        <div className="food-autocomplete-menu">
          <ul className="food-search-results">
            {suggestions.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(name)}
                >
                  {name}
                </button>
              </li>
            ))}
            {showAddCustom && (
              <li>
                <button
                  type="button"
                  className="food-search-result-new"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(trimmed)}
                >
                  <Icon name="plus" size={14} />
                  Add &quot;{trimmed}&quot;
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default EquipmentField
