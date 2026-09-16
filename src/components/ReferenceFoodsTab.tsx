import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import Icon from './Icon.tsx'
import { useFoodNameIndex, type FoodNameEntry } from '../hooks/useFoodNameIndex.ts'
import { buildFoodDocument } from '../lib/food.ts'
import {
  fetchPublicFoodByName,
  publicFoodToFormValues,
} from '../lib/publicFoodLookup.ts'
import { matchesQuery } from '../lib/search.ts'

const MAX_RESULTS = 50

function entryKey(entry: FoodNameEntry): string {
  return `${entry.name}|${entry.source}`
}

function ReferenceFoodsTab() {
  const navigate = useNavigate()
  const { names, loaded } = useFoodNameIndex()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [addingKey, setAddingKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  const trimmed = query.trim()
  const allResults = trimmed
    ? names.filter((entry) => matchesQuery(entry.name, trimmed))
    : []
  const results = allResults.slice(0, MAX_RESULTS)
  const truncated = allResults.length > MAX_RESULTS

  function toggleSelected(entry: FoodNameEntry) {
    const key = entryKey(entry)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allSelected =
    results.length > 0 && results.every((entry) => selected.has(entryKey(entry)))

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(results.map(entryKey)))
  }

  async function handleAdd(entry: FoodNameEntry) {
    setError('')
    setAddingKey(entryKey(entry))
    try {
      const food = await fetchPublicFoodByName(entry.name)
      if (!food) {
        setError(`Could not find nutrition data for "${entry.name}".`)
        return
      }
      navigate('/add-food', {
        state: {
          formKind: 'import',
          prefillValues: publicFoodToFormValues(food),
          addedFrom: { type: 'public', source: food.source },
          returnTo: '/foods',
          navToken: crypto.randomUUID(),
        },
      })
    } catch {
      setError('Could not load nutrition data. Please try again.')
    } finally {
      setAddingKey(null)
    }
  }

  async function handleImportSelected() {
    const user = auth.currentUser
    if (!user) return

    setError('')
    setImporting(true)
    try {
      const targets = results.filter((entry) => selected.has(entryKey(entry)))
      for (const entry of targets) {
        const food = await fetchPublicFoodByName(entry.name)
        if (!food) continue
        await addDoc(collection(db, 'users', user.uid, 'foods'), {
          ...buildFoodDocument(publicFoodToFormValues(food)),
          createdAt: Date.now(),
          addedFrom: { type: 'public', source: food.source },
        })
      }
      setSelected(new Set())
    } catch {
      setError('Could not import all selected foods. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <p className="form-hint">
        Search the AUSNUT, AFCD, and USDA reference databases and add
        nutrition data to your own foods.
      </p>

      <div className="search-bar">
        <Icon name="search" size={16} className="search-bar-icon" />
        <input
          type="text"
          aria-label="Search reference foods"
          placeholder="Search reference foods..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      {!trimmed ? (
        <p>Type a food name to search.</p>
      ) : !loaded ? (
        <p>Loading reference index...</p>
      ) : results.length === 0 ? (
        <p>No matching reference foods.</p>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="list-toolbar">
              <span>{selected.size} selected</span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleImportSelected}
                disabled={importing}
              >
                {importing ? 'Importing...' : 'Import Selected'}
              </button>
            </div>
          )}
          <div className="foods-table-wrap">
            <table className="foods-table">
              <thead>
                <tr>
                  <th aria-hidden="true">
                    <input
                      type="checkbox"
                      aria-label="Select all results"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Name</th>
                  <th>Source</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {results.map((entry) => (
                  <tr key={entryKey(entry)}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${entry.name}`}
                        checked={selected.has(entryKey(entry))}
                        onChange={() => toggleSelected(entry)}
                      />
                    </td>
                    <td>{entry.name}</td>
                    <td className="cell-mono">{entry.source}</td>
                    <td className="shopping-row-delete">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={addingKey === entryKey(entry)}
                        onClick={() => handleAdd(entry)}
                      >
                        {addingKey === entryKey(entry) ? 'Loading...' : 'Add'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {truncated && (
            <p className="form-hint">
              Showing the first {MAX_RESULTS} matches — narrow your search to
              see more specific results.
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default ReferenceFoodsTab
