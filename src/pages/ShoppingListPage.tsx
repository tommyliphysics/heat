import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import AddShoppingItemModal, {
  type NewShoppingItem,
} from '../components/AddShoppingItemModal.tsx'
import CurrencyMismatchModal from '../components/CurrencyMismatchModal.tsx'
import Icon from '../components/Icon.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import Modal from '../components/Modal.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { getCurrencySymbol } from '../data/currencies.ts'
import {
  autoResolveShoppingList,
  findBestAutoTarget,
  hasCurrencyMismatch,
  type ExchangeRateRecord,
} from '../lib/currencyResolution.ts'
import { useAllGroupInventoryBatches } from '../hooks/useAllGroupInventoryBatches.ts'
import { useInventoryBatches } from '../hooks/useInventoryBatches.ts'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import { applyInventoryPricing, isFoodStocked } from '../lib/inventory.ts'
import { computeReport, type ShoppingListEntry } from '../lib/report.ts'
import {
  computedEntryToRow,
  customItemToRow,
  type ShoppingRow,
} from '../lib/shoppingList.ts'
import { formatShortDate, toDateStr } from '../lib/timeline.ts'
import type { MealListItem, ShoppingListItemDocument } from '../types/food.ts'
import './pages.css'

type SortKey = 'name' | 'quantity' | 'price'
type FilterMode = 'all' | 'bought' | 'unbought'

function ShoppingListPage() {
  const navigate = useNavigate()
  const [meals, setMeals] = useState<MealListItem[]>([])
  const [mealsLoaded, setMealsLoaded] = useState(false)
  const [customItems, setCustomItems] = useState<
    (ShoppingListItemDocument & { id: string })[]
  >([])
  const [customItemsLoaded, setCustomItemsLoaded] = useState(false)
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateRecord[]>([])
  const { dateFormat } = useUserSettings()

  const todayStr = toDateStr(new Date())

  // Until the user picks a custom range, default to present through the
  // latest date with any planned meal — recalculated live as meals load or
  // change — rather than an arbitrary far-future cutoff.
  const latestMealDate = useMemo(() => {
    let latest = todayStr
    for (const meal of meals) {
      if (meal.date > latest) latest = meal.date
    }
    return latest
  }, [meals, todayStr])

  const [customRange, setCustomRange] = useState<[string, string] | null>(null)
  const range = useMemo<[string, string]>(
    () => customRange ?? [todayStr, latestMealDate],
    [customRange, todayStr, latestMealDate],
  )

  const [rangeModalOpen, setRangeModalOpen] = useState(false)
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')

  const [addItemOpen, setAddItemOpen] = useState(false)

  const [resolvedList, setResolvedList] = useState<ShoppingListEntry[]>([])
  const [mismatchOpen, setMismatchOpen] = useState(false)
  const [mismatchEntries, setMismatchEntries] = useState<ShoppingListEntry[]>([])

  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(collection(db, 'users', user.uid, 'meals'), (snapshot) => {
      setMeals(
        snapshot.docs.map(
          (docSnapshot) =>
            ({ id: docSnapshot.id, ...docSnapshot.data() }) as MealListItem,
        ),
      )
      setMealsLoaded(true)
    })
  }, [])

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'shoppingListItems'),
      (snapshot) => {
        setCustomItems(
          snapshot.docs.map(
            (docSnapshot) =>
              ({
                id: docSnapshot.id,
                ...docSnapshot.data(),
              }) as ShoppingListItemDocument & { id: string },
          ),
        )
        setCustomItemsLoaded(true)
      },
    )
  }, [])

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'exchangeRates'),
      (snapshot) => {
        setExchangeRates(
          snapshot.docs.map(
            (docSnapshot) => docSnapshot.data() as ExchangeRateRecord,
          ),
        )
      },
    )
  }, [])

  const { batches: inventoryBatches } = useInventoryBatches()
  const { batches: groupInventoryBatches } = useAllGroupInventoryBatches()
  const pricingResult = useMemo(
    () => applyInventoryPricing(meals, [...inventoryBatches, ...groupInventoryBatches]),
    [meals, inventoryBatches, groupInventoryBatches],
  )

  const rangeMeals = useMemo(() => {
    const [start, end] = range
    return pricingResult.meals.filter(
      (meal) => meal.date >= start && meal.date <= end,
    )
  }, [pricingResult, range])

  const shoppingList = useMemo(
    () => computeReport(rangeMeals, 1).shoppingList,
    [rangeMeals],
  )

  // A food is "bought" once its inventory batches' self-reported remaining
  // amounts cover all of it demanded by meals in range — independent of
  // cost, which is always based on what was purchased (see
  // `applyInventoryPricing`). No manual toggle any more, see the Inventory
  // page.
  const boughtByFoodId = useMemo(() => {
    const foodIds = new Set<string>()
    for (const meal of rangeMeals) {
      for (const foodId of Object.keys(meal.foods ?? {})) foodIds.add(foodId)
    }
    const map = new Map<string, boolean>()
    for (const foodId of foodIds) {
      map.set(foodId, isFoodStocked(foodId, rangeMeals, inventoryBatches))
    }
    return map
  }, [rangeMeals, inventoryBatches])

  // Same currency-mismatch handling as the Calendar's shopping list: auto-resolve
  // from stored exchange rates where possible, else ask the user to resolve it.
  useEffect(() => {
    if (!hasCurrencyMismatch(shoppingList)) {
      setResolvedList(shoppingList)
      setMismatchOpen(false)
      return
    }

    const autoTarget = findBestAutoTarget(shoppingList, exchangeRates)
    const autoResolved = autoTarget
      ? autoResolveShoppingList(shoppingList, autoTarget, exchangeRates)
      : shoppingList

    setResolvedList(autoResolved)

    if (hasCurrencyMismatch(autoResolved)) {
      setMismatchEntries(autoResolved)
      setMismatchOpen(true)
    } else {
      setMismatchOpen(false)
    }
  }, [shoppingList, exchangeRates])

  function handleMismatchResolved(resolved: ShoppingListEntry[]) {
    setMismatchOpen(false)
    setResolvedList(resolved)
  }

  const allRows = useMemo<ShoppingRow[]>(
    () => [
      ...resolvedList.map(computedEntryToRow),
      ...customItems.map(customItemToRow),
    ],
    [resolvedList, customItems],
  )

  // Custom (hand-typed) items have no linked food, so inventory can never
  // cover them — they always read as still needing to be bought.
  function isBought(row: ShoppingRow): boolean {
    return row.custom ? false : (boughtByFoodId.get(row.id) ?? false)
  }

  const displayRows = useMemo(() => {
    let rows = allRows
    if (filterMode === 'bought')
      rows = rows.filter((r) => !r.custom && (boughtByFoodId.get(r.id) ?? false))
    if (filterMode === 'unbought')
      rows = rows.filter((r) => r.custom || !(boughtByFoodId.get(r.id) ?? false))

    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const cmp =
          sortKey === 'name'
            ? a.name.localeCompare(b.name)
            : sortKey === 'quantity'
              ? a.quantityValue - b.quantityValue
              : a.totalPrice - b.totalPrice
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [allRows, filterMode, boughtByFoodId, sortKey, sortDir])

  const totalCurrency = useMemo(() => {
    const currencies = new Set(
      displayRows.map((r) => r.currency).filter(Boolean),
    )
    return currencies.size === 1 ? [...currencies][0] : null
  }, [displayRows])

  const total = displayRows.reduce((sum, r) => sum + r.totalPrice, 0)

  const totalLabel =
    filterMode === 'bought'
      ? 'Spent'
      : filterMode === 'unbought'
        ? 'Still to spend'
        : 'Total'

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function handleRowClick(row: ShoppingRow) {
    if (row.custom) {
      const item = customItems.find((i) => i.id === row.id)
      if (!item) return
      navigate('/inventory', {
        state: {
          focusOther: {
            name: item.name,
            amount: item.amount,
            unit: item.unit,
            price: item.price,
            currency: item.currency,
          },
        },
      })
      return
    }
    navigate('/inventory', { state: { focusFoodId: row.id } })
  }

  function cycleFilterMode() {
    setFilterMode((current) =>
      current === 'all' ? 'bought' : current === 'bought' ? 'unbought' : 'all',
    )
  }

  function openRangeModal() {
    setDraftStart(range[0])
    setDraftEnd(range[1])
    setRangeModalOpen(true)
  }

  function handleRangeSubmit() {
    if (!draftStart || !draftEnd) return
    setCustomRange([draftStart, draftEnd])
    setFilterMode('all')
    setRangeModalOpen(false)
  }

  async function handleAddItem(item: NewShoppingItem) {
    const user = auth.currentUser
    if (!user) return

    await addDoc(collection(db, 'users', user.uid, 'shoppingListItems'), {
      ...item,
      createdAt: Date.now(),
    })
  }

  async function handleDeleteItem(id: string) {
    const user = auth.currentUser
    if (!user) return

    await deleteDoc(doc(db, 'users', user.uid, 'shoppingListItems', id))
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null
    return (
      <Icon
        name="chevron-down"
        size={12}
        className={sortDir === 'asc' ? 'sort-asc' : undefined}
      />
    )
  }

  const mealRows = displayRows.filter((row) => !row.custom)
  const additionalRows = displayRows.filter((row) => row.custom)
  // Whether each section has any items at all, regardless of the current
  // filter — used to decide whether to show the section (and its header,
  // which holds the filter-cycle button) at all.
  const hasMealRows = allRows.some((row) => !row.custom)
  const hasAdditionalRows = allRows.some((row) => row.custom)

  function renderTable(rows: ShoppingRow[], showDelete: boolean) {
    return (
      <div className="foods-table-wrap">
        <table className="foods-table shopping-list-table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="th-sort-btn"
                  onClick={() => handleSort('name')}
                >
                  Item
                  {sortIndicator('name')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-sort-btn"
                  onClick={() => handleSort('quantity')}
                >
                  Amount
                  {sortIndicator('quantity')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="th-sort-btn"
                  onClick={() => handleSort('price')}
                >
                  Cost
                  {sortIndicator('price')}
                </button>
              </th>
              <th className="shopping-row-check">
                <button
                  type="button"
                  className={`icon-btn icon-btn-sm${
                    filterMode === 'bought'
                      ? ' icon-btn-active'
                      : filterMode === 'unbought'
                        ? ' icon-btn-info'
                        : ''
                  }`}
                  onClick={cycleFilterMode}
                  aria-label={
                    filterMode === 'all'
                      ? 'Show only bought items'
                      : filterMode === 'bought'
                        ? 'Show only unbought items'
                        : 'Show all items'
                  }
                >
                  {filterMode === 'bought' ? (
                    <Icon name="check" size={14} />
                  ) : filterMode === 'unbought' ? (
                    <span className="shopping-dot" aria-hidden="true" />
                  ) : (
                    <span className="shopping-filter-both" aria-hidden="true">
                      <Icon name="check" size={12} />
                      <span className="shopping-dot" />
                    </span>
                  )}
                </button>
              </th>
              {showDelete && <th aria-hidden="true" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  className="shopping-row-empty"
                  colSpan={showDelete ? 5 : 4}
                >
                  {filterMode === 'bought'
                    ? 'No bought items'
                    : 'No unbought items'}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const bought = isBought(row)
              const rowClassName = [bought && 'shopping-row-bought']
                .filter(Boolean)
                .join(' ')

              return (
                <tr
                  key={row.id}
                  className={rowClassName || undefined}
                  onClick={() => handleRowClick(row)}
                >
                  <td>{row.name}</td>
                  <td className="cell-mono">{row.quantityLabel}</td>
                  <td className="cell-mono">
                    {row.currency ? getCurrencySymbol(row.currency) : ''}
                    {row.totalPrice.toFixed(2)}
                  </td>
                  <td className="shopping-row-check">
                    {bought ? (
                      <Icon
                        name="check"
                        size={16}
                        className="shopping-check-icon"
                      />
                    ) : (
                      <span className="shopping-dot" aria-hidden="true" />
                    )}
                  </td>
                  {showDelete && (
                    <td className="shopping-row-delete">
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        aria-label={`Delete ${row.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteItem(row.id)
                        }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      <PageLayout
        header={
          <>
            <div className="calendar-header-row">
              <h1>Shopping List</h1>
              <button
                type="button"
                className="icon-btn"
                onClick={openRangeModal}
                aria-label="Choose date range"
              >
                <Icon name="calendar" size={17} />
              </button>
            </div>
            <p className="shopping-list-range">
              {formatShortDate(range[0], dateFormat)} &ndash;{' '}
              {formatShortDate(range[1], dateFormat)}
            </p>
            <div className="report-stat shopping-list-total">
              <span className="report-stat-label">{totalLabel}</span>
              <span className="report-stat-value">
                {totalCurrency ? getCurrencySymbol(totalCurrency) : ''}
                {total.toFixed(2)}
              </span>
            </div>
          </>
        }
      >
        <button
          type="button"
          className="btn btn-secondary page-add-btn"
          onClick={() => setAddItemOpen(true)}
        >
          <Icon name="plus" size={16} />
          Add Item
        </button>

        {!mealsLoaded || !customItemsLoaded ? (
          <LoadingIndicator />
        ) : allRows.length === 0 ? (
          <p>No items in this shopping list.</p>
        ) : (
          <>
            {hasMealRows && (
              <>
                <h2 className="form-section-heading">From Meals</h2>
                {renderTable(mealRows, false)}
              </>
            )}
            {hasAdditionalRows && (
              <>
                <h2 className="form-section-heading">Additional</h2>
                {renderTable(additionalRows, true)}
              </>
            )}
          </>
        )}
      </PageLayout>

      <Modal
        open={rangeModalOpen}
        onClose={() => setRangeModalOpen(false)}
        titleId="shopping-range-title"
        title="Date Range"
      >
        <label htmlFor="range-start">From</label>
        <input
          id="range-start"
          type="date"
          value={draftStart}
          onChange={(e) => setDraftStart(e.target.value)}
        />

        <label htmlFor="range-end">To</label>
        <input
          id="range-end"
          type="date"
          value={draftEnd}
          onChange={(e) => setDraftEnd(e.target.value)}
        />

        <button
          type="button"
          className="btn btn-primary btn-full"
          disabled={!draftStart || !draftEnd}
          onClick={handleRangeSubmit}
        >
          Recalculate
        </button>
      </Modal>

      <AddShoppingItemModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onAdd={handleAddItem}
        defaultCurrency={totalCurrency ?? 'USD'}
      />

      <CurrencyMismatchModal
        open={mismatchOpen}
        onClose={() => setMismatchOpen(false)}
        entries={mismatchEntries}
        meals={rangeMeals}
        weekStart={range[0]}
        weekEnd={range[1]}
        onResolved={handleMismatchResolved}
      />
    </>
  )
}

export default ShoppingListPage
