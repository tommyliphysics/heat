import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import LoadingIndicator from './LoadingIndicator.tsx'
import { useConnections } from '../hooks/useConnections.ts'
import { useGroups } from '../hooks/useGroups.ts'
import { useSharedRecipes, type SharedRecipeItem } from '../hooks/useSharedRecipes.ts'
import { connectionDisplayName } from '../lib/connect.ts'
import { buildRecipeDocument, recipeDocumentToFormValues } from '../lib/recipe.ts'

function ConnectionsRecipesTab() {
  const navigate = useNavigate()
  const { groups } = useGroups()
  const { connections } = useConnections()
  const { recipes, loaded } = useSharedRecipes(groups.map((g) => g.id))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const nameByUid = new Map(connections.map((c) => [c.peerUid, connectionDisplayName(c)]))

  function sharerName(recipe: SharedRecipeItem): string {
    return nameByUid.get(recipe.ownerUid) ?? 'A connection'
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = recipes.length > 0 && recipes.every((r) => selected.has(r.id))

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(recipes.map((r) => r.id)))
  }

  function handleAdd(recipe: SharedRecipeItem) {
    navigate('/add-recipe', {
      state: {
        formKind: 'import',
        prefillValues: recipeDocumentToFormValues(recipe),
        addedFrom: {
          type: 'connection',
          peerUid: recipe.ownerUid,
          peerName: sharerName(recipe),
        },
        returnTo: '/recipes',
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
      const targets = recipes.filter((recipe) => selected.has(recipe.id))
      for (const recipe of targets) {
        await addDoc(collection(db, 'users', user.uid, 'recipes'), {
          ...buildRecipeDocument(recipeDocumentToFormValues(recipe)),
          createdAt: Date.now(),
          addedFrom: {
            type: 'connection',
            peerUid: recipe.ownerUid,
            peerName: sharerName(recipe),
          },
        })
      }
      setSelected(new Set())
    } catch {
      setError('Could not import all selected recipes. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  if (!loaded) return <LoadingIndicator />
  if (recipes.length === 0) {
    return <p>No recipes have been shared with you yet.</p>
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
                  aria-label="Select all shared recipes"
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
            {recipes.map((recipe) => (
              <tr key={recipe.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${recipe.name}`}
                    checked={selected.has(recipe.id)}
                    onChange={() => toggleSelected(recipe.id)}
                  />
                </td>
                <td>{recipe.name}</td>
                <td>{sharerName(recipe)}</td>
                <td className="shopping-row-delete">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleAdd(recipe)}
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

export default ConnectionsRecipesTab
