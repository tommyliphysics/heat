import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import BulkShareBar, { type BulkShareTarget } from '../components/BulkShareBar.tsx'
import ConnectionsRecipesTab from '../components/ConnectionsRecipesTab.tsx'
import Icon from '../components/Icon.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import RecipeFilterPanel from '../components/RecipeFilterPanel.tsx'
import ShareTargetSelect from '../components/ShareTargetSelect.tsx'
import TabBar from '../components/TabBar.tsx'
import { getCurrencySymbol } from '../data/currencies.ts'
import { useConnections } from '../hooks/useConnections.ts'
import { useGroups } from '../hooks/useGroups.ts'
import { getOrCreatePairGroup } from '../lib/groups.ts'
import { computeRecipeNutritionPerServe } from '../lib/recipe.ts'
import {
  EMPTY_RECIPE_FILTERS,
  hasActiveRecipeFilters,
  matchesRecipeFilters,
  recipeCostCurrency,
  type RecipeFilters,
} from '../lib/recipeFilters.ts'
import { matchesQuery } from '../lib/search.ts'
import { convertEnergy } from '../lib/units.ts'
import type { FoodDocument, RecipeDocument } from '../types/food.ts'
import './pages.css'

type RecipeListItem = RecipeDocument & { id: string }
type RecipesTab = 'mine' | 'connections'

/**
 * A recipe's own `foods` map stores each ingredient's *listed* quantity
 * (how much the recipe actually uses) alongside that food's nutrition
 * snapshotted at whatever quantity the food document itself was defined
 * per (e.g. "per 100g") — the two aren't the same amount. Reading
 * `food.energy.amount` directly, as this used to, silently ignored that and
 * counted every ingredient as if only its own reference quantity had been
 * used, regardless of how much the recipe actually calls for. Scaling
 * against the live food doc (`computeRecipeNutritionPerServe`, the same
 * math `ViewRecipePage` uses) is what actually accounts for the listed
 * quantity.
 */
function caloriesPerServe(
  recipe: RecipeDocument,
  currentFoods: Record<string, FoodDocument>,
): string {
  if (!Number(recipe.servings)) return '—'

  const perServe = computeRecipeNutritionPerServe(recipe, currentFoods)
  return String(Math.round(convertEnergy(perServe.energyAmount, perServe.energyUnit, 'cal')))
}

function MyRecipesPage() {
  const [activeTab, setActiveTab] = useState<RecipesTab>('mine')
  const [recipes, setRecipes] = useState<RecipeListItem[]>([])
  const [recipesLoaded, setRecipesLoaded] = useState(false)
  const [currentFoods, setCurrentFoods] = useState<Record<string, FoodDocument>>({})
  const [foodsLoaded, setFoodsLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const { groups } = useGroups()
  const { connections } = useConnections()
  const manualGroups = groups.filter((group) => group.kind !== 'autoPair')

  // `appliedFilters` drives the table; `draftFilters` is what the panel edits
  // and only takes effect once "Apply" is clicked.
  const [appliedFilters, setAppliedFilters] =
    useState<RecipeFilters>(EMPTY_RECIPE_FILTERS)
  const [draftFilters, setDraftFilters] =
    useState<RecipeFilters>(EMPTY_RECIPE_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  // Keyed by recipe id — cleared as soon as that row's own select changes
  // again, so switching (or retrying) never leaves a stale message behind.
  const [shareErrors, setShareErrors] = useState<Record<string, string>>({})
  const [bulkShareError, setBulkShareError] = useState('')
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (filterOpen) {
      filterPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }, [filterOpen])

  function toggleFilterPanel() {
    if (!filterOpen) setDraftFilters(appliedFilters)
    setFilterOpen((current) => !current)
  }

  function handleApplyFilters() {
    setAppliedFilters(draftFilters)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleClearFilters() {
    setDraftFilters(EMPTY_RECIPE_FILTERS)
    setAppliedFilters(EMPTY_RECIPE_FILTERS)
  }

  // Grants read-only access to the chosen group's (or connection's hidden
  // pair-group's) members (see firestore.rules) — there is no write path
  // for a group member either here or anywhere else, so changing this is
  // the only effect it has.
  async function handleChangeSharedWith(recipe: RecipeListItem, target: BulkShareTarget | null) {
    const user = auth.currentUser
    if (!user?.email) return

    // Sharing (but not un-sharing) requires equipment to already be listed —
    // a private recipe has no one else who'd need to know what it requires,
    // so the field only needs to be filled in once someone else can see it.
    if (target && (recipe.equipment ?? []).length === 0) {
      setShareErrors((current) => ({
        ...current,
        [recipe.id]: 'Add required equipment to this recipe before sharing it.',
      }))
      return
    }

    setShareErrors((current) => {
      const { [recipe.id]: _removed, ...rest } = current
      return rest
    })

    const groupId =
      !target
        ? null
        : target.type === 'group'
          ? target.groupId
          : await getOrCreatePairGroup(
              user.uid,
              user.email,
              target.peerUid,
              connections.find((c) => c.peerUid === target.peerUid)?.peerEmail ?? '',
            )

    await updateDoc(doc(db, 'users', user.uid, 'recipes', recipe.id), {
      sharedWith: groupId ?? deleteField(),
    })
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(
      allVisibleSelected ? new Set() : new Set(visibleRecipes.map((r) => r.id)),
    )
  }

  async function handleBulkShare(target: BulkShareTarget) {
    const user = auth.currentUser
    if (!user?.email) return

    setBulkShareError('')
    const targets = recipes.filter((recipe) => selected.has(recipe.id))
    const missingEquipment = targets.filter((recipe) => (recipe.equipment ?? []).length === 0)
    const shareable = targets.filter((recipe) => (recipe.equipment ?? []).length > 0)

    const groupId =
      target.type === 'group'
        ? target.groupId
        : await getOrCreatePairGroup(
            user.uid,
            user.email,
            target.peerUid,
            connections.find((c) => c.peerUid === target.peerUid)?.peerEmail ?? '',
          )

    await Promise.all(
      shareable.map((recipe) =>
        updateDoc(doc(db, 'users', user.uid, 'recipes', recipe.id), { sharedWith: groupId }),
      ),
    )

    if (missingEquipment.length > 0) {
      setBulkShareError(
        `Skipped (needs required equipment first): ${missingEquipment.map((r) => r.name).join(', ')}`,
      )
    }
    setSelected(new Set())
  }

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'recipes'),
      (snapshot) => {
        setRecipes(
          snapshot.docs.map(
            (docSnapshot) =>
              ({ id: docSnapshot.id, ...docSnapshot.data() }) as RecipeListItem,
          ),
        )
        setRecipesLoaded(true)
      },
    )
  }, [])

  // A one-time fetch (not a live listener) matching ViewRecipePage's own
  // pattern — this only needs to be fresh enough to scale each recipe's
  // ingredients by their *current* nutrition, not update mid-session every
  // time a food is edited elsewhere.
  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    getDocs(collection(db, 'users', user.uid, 'foods')).then((snapshot) => {
      setCurrentFoods(
        Object.fromEntries(
          snapshot.docs.map((docSnapshot) => [
            docSnapshot.id,
            docSnapshot.data() as FoodDocument,
          ]),
        ),
      )
      setFoodsLoaded(true)
    })
  }, [])

  const sortedRecipes = useMemo(
    () =>
      recipes
        .map((recipe) => ({ recipe, createdAt: recipe.createdAt ?? Date.now() }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ recipe }) => recipe),
    [recipes],
  )

  const dominantCostCurrency = useMemo(
    () => recipeCostCurrency(recipes),
    [recipes],
  )
  const costUnit = dominantCostCurrency
    ? getCurrencySymbol(dominantCostCurrency)
    : null

  const visibleRecipes = useMemo(() => {
    const trimmed = query.trim()
    return sortedRecipes
      .filter((recipe) => !trimmed || matchesQuery(recipe.name, trimmed))
      .filter((recipe) =>
        matchesRecipeFilters(recipe, appliedFilters, dominantCostCurrency),
      )
  }, [sortedRecipes, query, appliedFilters, dominantCostCurrency])

  const allVisibleSelected =
    visibleRecipes.length > 0 && visibleRecipes.every((r) => selected.has(r.id))

  const filtersActive = hasActiveRecipeFilters(appliedFilters)

  return (
    <PageLayout
      header={
        <>
          <h1>Recipes</h1>
          <TabBar
            tabs={[
              { id: 'mine', label: 'My Recipes' },
              { id: 'connections', label: 'Connections' },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </>
      }
    >
      <div ref={topRef} />

      {activeTab === 'connections' && <ConnectionsRecipesTab />}

      {activeTab === 'mine' && (
        <>
          <Link to="/add-recipe" className="btn btn-primary page-add-btn">
            <Icon name="plus" size={16} />
            Add Recipe
          </Link>

          <div className="list-toolbar">
            <div className="search-bar">
              <Icon name="search" size={16} className="search-bar-icon" />
              <input
                type="text"
                aria-label="Search recipes"
                placeholder="Search recipes..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={toggleFilterPanel}
              aria-label="Filter recipes"
              aria-expanded={filterOpen}
            >
              <Icon name="filter" size={16} />
              {filtersActive && (
                <span className="icon-btn-dot" aria-hidden="true" />
              )}
            </button>
          </div>

          {!recipesLoaded || !foodsLoaded ? (
            <LoadingIndicator />
          ) : visibleRecipes.length === 0 ? (
            <p>
              {recipes.length === 0
                ? 'No recipes added yet.'
                : 'No recipes match your search and filters.'}
            </p>
          ) : (
            <>
              {selected.size > 0 && (
                <BulkShareBar
                  selectedCount={selected.size}
                  manualGroups={manualGroups}
                  connections={connections}
                  onShare={handleBulkShare}
                />
              )}
              {bulkShareError && <p className="form-error">{bulkShareError}</p>}
              <div className="foods-table-wrap">
                <table className="foods-table">
                  <thead>
                    <tr>
                      <th aria-hidden="true">
                        <input
                          type="checkbox"
                          aria-label="Select all recipes"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>Name</th>
                      <th>Calories / Serve</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecipes.map((recipe) => (
                      <tr key={recipe.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${recipe.name}`}
                            checked={selected.has(recipe.id)}
                            onChange={() => toggleSelected(recipe.id)}
                          />
                        </td>
                        <td>
                          <Link to={`/recipes/${recipe.id}`}>{recipe.name}</Link>
                        </td>
                        <td className="cell-mono">{caloriesPerServe(recipe, currentFoods)}</td>
                        <td>
                          <ShareTargetSelect
                            ariaLabel={`Share ${recipe.name} with`}
                            groups={groups}
                            connections={connections}
                            myUid={auth.currentUser?.uid ?? ''}
                            sharedWith={recipe.sharedWith}
                            onChange={(target) => handleChangeSharedWith(recipe, target)}
                          />
                          {shareErrors[recipe.id] && (
                            <p className="form-error">
                              {shareErrors[recipe.id]}{' '}
                              <Link to={`/recipes/${recipe.id}/edit`}>Edit recipe</Link>
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {filterOpen && (
            <div ref={filterPanelRef} className="filter-panel-anchor">
              <RecipeFilterPanel
                filters={draftFilters}
                onChange={setDraftFilters}
                onApply={handleApplyFilters}
                onClear={handleClearFilters}
                costUnit={costUnit}
              />
            </div>
          )}
        </>
      )}
    </PageLayout>
  )
}

export default MyRecipesPage
