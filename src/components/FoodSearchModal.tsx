import { useState } from 'react'
import Modal from './Modal.tsx'
import Icon from './Icon.tsx'
import type { FoodListItem } from '../hooks/useFoodRows.ts'
import { foodDisplayName } from '../lib/food.ts'
import { matchesQuery } from '../lib/search.ts'

type FoodSearchModalProps = {
  open: boolean
  onClose: () => void
  foods: FoodListItem[]
  onSelect: (food: FoodListItem) => void
  onCreateNew: (query: string) => void
}

function FoodSearchModal({
  open,
  onClose,
  foods,
  onSelect,
  onCreateNew,
}: FoodSearchModalProps) {
  const [query, setQuery] = useState('')

  function handleClose() {
    setQuery('')
    onClose()
  }

  function handleSelect(food: FoodListItem) {
    onSelect(food)
    setQuery('')
    onClose()
  }

  function handleCreateNew() {
    onCreateNew(query.trim())
    setQuery('')
  }

  const trimmed = query.trim()
  const results = trimmed
    ? foods.filter((food) => matchesQuery(food.name, trimmed))
    : []

  return (
    <Modal
      open={open}
      onClose={handleClose}
      titleId="food-search-title"
      title="Add Ingredient"
    >
      <label htmlFor="food-search">Food name</label>
      <input
        id="food-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing..."
        autoComplete="off"
        autoFocus
      />

      {trimmed &&
        (results.length > 0 ? (
          <ul className="food-search-results">
            {results.map((food) => (
              <li key={food.id}>
                <button type="button" onClick={() => handleSelect(food)}>
                  {foodDisplayName(food)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="food-search-results">
            <li>
              <button
                type="button"
                className="food-search-result-new"
                onClick={handleCreateNew}
              >
                <Icon name="plus" size={14} />
                New Food
              </button>
            </li>
          </ul>
        ))}

      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={handleClose}
      >
        Cancel
      </button>
    </Modal>
  )
}

export default FoodSearchModal
