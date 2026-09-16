import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, deleteField, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import BulkShareBar, { type BulkShareTarget } from '../components/BulkShareBar.tsx'
import ConnectionsFoodsTab from '../components/ConnectionsFoodsTab.tsx'
import FoodFilterPanel from '../components/FoodFilterPanel.tsx'
import Icon from '../components/Icon.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import ReferenceFoodsTab from '../components/ReferenceFoodsTab.tsx'
import ShareTargetSelect from '../components/ShareTargetSelect.tsx'
import TabBar from '../components/TabBar.tsx'
import { getCurrencySymbol } from '../data/currencies.ts'
import { useConnections } from '../hooks/useConnections.ts'
import { useGroups } from '../hooks/useGroups.ts'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import {
  EMPTY_FOOD_FILTERS,
  foodCostCurrency,
  hasActiveFoodFilters,
  matchesFoodFilters,
  type FoodFilters,
} from '../lib/foodFilters.ts'
import { foodDisplayName } from '../lib/food.ts'
import { getOrCreatePairGroup } from '../lib/groups.ts'
import { matchesQuery } from '../lib/search.ts'
import { formatShortDateFromTimestamp } from '../lib/timeline.ts'
import { formatQuantityLabel } from '../lib/units.ts'
import type { FoodDocument } from '../types/food.ts'
import './pages.css'

type FoodListItem = FoodDocument & { id: string }
type FoodsTab = 'mine' | 'connections' | 'reference'

/**
 * Prices quoted per multiple servings (e.g. "$9.60 for 12 servings") are
 * shown here per single serving instead — comparable across foods/retailers
 * in a way "for 12 servings" isn't — regardless of how many servings the
 * price is actually recorded for. Every other unit (kg, lb, ...) is shown
 * exactly as recorded, where "price / 3kg" is already meaningful.
 */
function formatFoodPrice(food: FoodListItem): string {
  if (!food.price?.amount || !food.price?.currency) return ''

  const quantity = food.price.quantity ?? food.quantity
  const priceAmount = Number(food.price.amount)
  const servings = quantity.unit === 'serving' ? Number(quantity.amount) : 0

  const displayAmount = servings ? priceAmount / servings : priceAmount
  const displayQuantity = servings
    ? { amount: '1', unit: 'serving' as const }
    : quantity

  const perLabel = formatQuantityLabel(
    displayQuantity.amount,
    displayQuantity.unit,
    food.servingSize,
  )

  return `${getCurrencySymbol(food.price.currency)}${displayAmount.toFixed(2)}/${perLabel}`
}

function MyFoodsPage() {
  const [activeTab, setActiveTab] = useState<FoodsTab>('mine')
  const [foods, setFoods] = useState<FoodListItem[]>([])
  const [foodsLoaded, setFoodsLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const { groups } = useGroups()
  const { connections } = useConnections()
  const { dateFormat } = useUserSettings()
  const manualGroups = groups.filter((group) => group.kind !== 'autoPair')

  // `appliedFilters` drives the table; `draftFilters` is what the panel edits
  // and only takes effect once "Apply" is clicked.
  const [appliedFilters, setAppliedFilters] =
    useState<FoodFilters>(EMPTY_FOOD_FILTERS)
  const [draftFilters, setDraftFilters] =
    useState<FoodFilters>(EMPTY_FOOD_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(collection(db, 'users', user.uid, 'foods'), (snapshot) => {
      setFoods(
        snapshot.docs
          .map(
            (docSnapshot) =>
              ({ id: docSnapshot.id, ...docSnapshot.data() }) as FoodListItem,
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      setFoodsLoaded(true)
    })
  }, [])

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
    setDraftFilters(EMPTY_FOOD_FILTERS)
    setAppliedFilters(EMPTY_FOOD_FILTERS)
  }

  // Grants read-only access to the chosen group's (or connection's hidden
  // pair-group's) members (see firestore.rules) — there is no write path
  // for a group member either here or anywhere else, so changing this is
  // the only effect it has.
  async function handleChangeSharedWith(food: FoodListItem, target: BulkShareTarget | null) {
    const user = auth.currentUser
    if (!user?.email) return

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

    await updateDoc(doc(db, 'users', user.uid, 'foods', food.id), {
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
    setSelected(allVisibleSelected ? new Set() : new Set(visibleFoods.map((f) => f.id)))
  }

  async function handleBulkShare(target: BulkShareTarget) {
    const user = auth.currentUser
    if (!user?.email) return

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
      [...selected].map((id) =>
        updateDoc(doc(db, 'users', user.uid, 'foods', id), { sharedWith: groupId }),
      ),
    )
    setSelected(new Set())
  }

  const dominantCostCurrency = useMemo(() => foodCostCurrency(foods), [foods])
  const costUnit = dominantCostCurrency
    ? getCurrencySymbol(dominantCostCurrency)
    : null

  const visibleFoods = useMemo(() => {
    const trimmed = query.trim()
    return foods
      .filter((food) => !trimmed || matchesQuery(food.name, trimmed))
      .filter((food) =>
        matchesFoodFilters(food, appliedFilters, dominantCostCurrency),
      )
  }, [foods, query, appliedFilters, dominantCostCurrency])

  const allVisibleSelected =
    visibleFoods.length > 0 && visibleFoods.every((f) => selected.has(f.id))

  const filtersActive = hasActiveFoodFilters(appliedFilters)

  return (
    <PageLayout
      header={
        <>
          <h1>Foods</h1>
          <TabBar
            tabs={[
              { id: 'mine', label: 'My Foods' },
              { id: 'connections', label: 'Connections' },
              { id: 'reference', label: 'Reference' },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </>
      }
    >
      <div ref={topRef} />

      {activeTab === 'connections' && <ConnectionsFoodsTab />}
      {activeTab === 'reference' && <ReferenceFoodsTab />}

      {activeTab === 'mine' && (
        <>
          <Link to="/add-food" className="btn btn-primary page-add-btn">
            <Icon name="plus" size={16} />
            Add Food
          </Link>

          <div className="list-toolbar">
            <div className="search-bar">
              <Icon name="search" size={16} className="search-bar-icon" />
              <input
                type="text"
                aria-label="Search foods"
                placeholder="Search foods..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={toggleFilterPanel}
              aria-label="Filter foods"
              aria-expanded={filterOpen}
            >
              <Icon name="filter" size={16} />
              {filtersActive && (
                <span className="icon-btn-dot" aria-hidden="true" />
              )}
            </button>
          </div>

          {!foodsLoaded ? (
            <LoadingIndicator />
          ) : visibleFoods.length === 0 ? (
            <p>
              {foods.length === 0
                ? 'No foods added yet.'
                : 'No foods match your search and filters.'}
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
              <div className="foods-table-wrap">
                <table className="foods-table">
                  <thead>
                    <tr>
                      <th aria-hidden="true">
                        <input
                          type="checkbox"
                          aria-label="Select all foods"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>Name</th>
                      <th>Price</th>
                      <th>Added</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFoods.map((food) => (
                      <tr key={food.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${food.name}`}
                            checked={selected.has(food.id)}
                            onChange={() => toggleSelected(food.id)}
                          />
                        </td>
                        <td>
                          <Link to={`/foods/${food.id}/edit`}>
                            {foodDisplayName(food)}
                          </Link>
                        </td>
                        <td className="cell-mono">{formatFoodPrice(food)}</td>
                        <td className="cell-mono">
                          {food.createdAt
                            ? formatShortDateFromTimestamp(food.createdAt, dateFormat)
                            : ''}
                        </td>
                        <td>
                          <ShareTargetSelect
                            ariaLabel={`Share ${food.name} with`}
                            groups={groups}
                            connections={connections}
                            myUid={auth.currentUser?.uid ?? ''}
                            sharedWith={food.sharedWith}
                            onChange={(target) => handleChangeSharedWith(food, target)}
                          />
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
              <FoodFilterPanel
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

export default MyFoodsPage
