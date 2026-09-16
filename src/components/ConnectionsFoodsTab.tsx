import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import LoadingIndicator from './LoadingIndicator.tsx'
import { useConnections } from '../hooks/useConnections.ts'
import { useGroups } from '../hooks/useGroups.ts'
import { useSharedFoods, type SharedFoodItem } from '../hooks/useSharedFoods.ts'
import { connectionDisplayName } from '../lib/connect.ts'
import { buildFoodDocument, foodDocumentToFormValues } from '../lib/food.ts'

function ConnectionsFoodsTab() {
  const navigate = useNavigate()
  const { groups } = useGroups()
  const { connections } = useConnections()
  const { foods, loaded } = useSharedFoods(groups.map((g) => g.id))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const nameByUid = new Map(connections.map((c) => [c.peerUid, connectionDisplayName(c)]))

  function sharerName(food: SharedFoodItem): string {
    return nameByUid.get(food.ownerUid) ?? 'A connection'
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = foods.length > 0 && foods.every((f) => selected.has(f.id))

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(foods.map((f) => f.id)))
  }

  function handleAdd(food: SharedFoodItem) {
    navigate('/add-food', {
      state: {
        formKind: 'import',
        prefillValues: foodDocumentToFormValues(food),
        addedFrom: { type: 'connection', peerUid: food.ownerUid, peerName: sharerName(food) },
        returnTo: '/foods',
        navToken: crypto.randomUUID(),
      },
    })
  }

  async function handleImportSelected() {
    const user = auth.currentUser
    if (!user) return

    setError('')
    setImporting(true)
    try {
      const targets = foods.filter((food) => selected.has(food.id))
      for (const food of targets) {
        await addDoc(collection(db, 'users', user.uid, 'foods'), {
          ...buildFoodDocument(foodDocumentToFormValues(food)),
          createdAt: Date.now(),
          addedFrom: {
            type: 'connection',
            peerUid: food.ownerUid,
            peerName: sharerName(food),
          },
        })
      }
      setSelected(new Set())
    } catch {
      setError('Could not import all selected foods. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  if (!loaded) return <LoadingIndicator />
  if (foods.length === 0) {
    return <p>No foods have been shared with you yet.</p>
  }

  return (
    <div>
      {error && <p className="form-error">{error}</p>}

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
                  aria-label="Select all shared foods"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Name</th>
              <th>Shared By</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {foods.map((food) => (
              <tr key={food.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${food.name}`}
                    checked={selected.has(food.id)}
                    onChange={() => toggleSelected(food.id)}
                  />
                </td>
                <td>{food.name}</td>
                <td>{sharerName(food)}</td>
                <td className="shopping-row-delete">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleAdd(food)}
                  >
                    Add
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ConnectionsFoodsTab
