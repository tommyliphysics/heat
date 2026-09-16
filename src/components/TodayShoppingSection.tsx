import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addDoc, collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import AddShoppingItemModal, { type NewShoppingItem } from './AddShoppingItemModal.tsx'
import Icon from './Icon.tsx'
import LoadingIndicator from './LoadingIndicator.tsx'
import { getCurrencySymbol } from '../data/currencies.ts'
import { useInventoryBatches } from '../hooks/useInventoryBatches.ts'
import { isFoodStocked } from '../lib/inventory.ts'
import { computeReport } from '../lib/report.ts'
import {
  computedEntryToRow,
  customItemToRow,
  type ShoppingRow,
} from '../lib/shoppingList.ts'
import type { MealListItem, ShoppingListItemDocument } from '../types/food.ts'

type TodayShoppingSectionProps = {
  meals: MealListItem[]
  loaded: boolean
}

/**
 * A quick "what's left to buy today" glance, scoped to today's meals
 * instead of a date range — bought items drop off the list entirely
 * rather than sticking around checked off (see the full Shopping List
 * page for the complete bought/unbought view with sort/filter/date-range
 * controls).
 */
function TodayShoppingSection({ meals, loaded }: TodayShoppingSectionProps) {
  const navigate = useNavigate()
  const { batches: inventoryBatches } = useInventoryBatches()
  const [customItems, setCustomItems] = useState<
    (ShoppingListItemDocument & { id: string })[]
  >([])
  const [customItemsLoaded, setCustomItemsLoaded] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)

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

  const shoppingList = useMemo(
    () => computeReport(meals, 1).shoppingList,
    [meals],
  )

  const boughtByFoodId = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const entry of shoppingList) {
      map.set(entry.foodId, isFoodStocked(entry.foodId, meals, inventoryBatches))
    }
    return map
  }, [shoppingList, meals, inventoryBatches])

  const mealRows = useMemo(
    () => shoppingList.map(computedEntryToRow),
    [shoppingList],
  )
  const additionalRows = useMemo(
    () => customItems.map(customItemToRow),
    [customItems],
  )

  // Custom (hand-typed) items have no linked food, so inventory can never
  // cover them — they always read as still needing to be bought.
  function isBought(row: ShoppingRow): boolean {
    return row.custom ? false : (boughtByFoodId.get(row.id) ?? false)
  }

  // The dashboard is a "what's left to do today" glance, not a full
  // checklist — once something's bought it drops off here instead of
  // sticking around checked off (see the full Shopping List page for that).
  const unboughtMealRows = mealRows.filter((row) => !isBought(row))
  const unboughtAdditionalRows = additionalRows.filter((row) => !isBought(row))

  const allUnboughtRows = [...unboughtMealRows, ...unboughtAdditionalRows]
  const totalCost = allUnboughtRows.reduce((sum, row) => sum + row.totalPrice, 0)
  const totalCostCurrency = allUnboughtRows.find((row) => row.currency)?.currency

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
          returnTo: '/dashboard',
        },
      })
      return
    }
    navigate('/inventory', { state: { focusFoodId: row.id, returnTo: '/dashboard' } })
  }

  async function handleDeleteItem(id: string) {
    const user = auth.currentUser
    if (!user) return

    await deleteDoc(doc(db, 'users', user.uid, 'shoppingListItems', id))
  }

  async function handleAddItem(item: NewShoppingItem) {
    const user = auth.currentUser
    if (!user) return

    await addDoc(collection(db, 'users', user.uid, 'shoppingListItems'), {
      ...item,
      createdAt: Date.now(),
    })
  }

  function renderTable(rows: ShoppingRow[], showDelete: boolean) {
    return (
      <div className="foods-table-wrap">
        <table className="foods-table shopping-list-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Amount</th>
              <th>Cost</th>
              {showDelete && <th aria-hidden="true" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              return (
                <tr key={row.id} onClick={() => handleRowClick(row)}>
                  <td>{row.name}</td>
                  <td className="cell-mono">{row.quantityLabel}</td>
                  <td className="cell-mono">
                    {row.currency ? getCurrencySymbol(row.currency) : ''}
                    {row.totalPrice.toFixed(2)}
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
    <section className="dashboard-section">
      <h2 className="dashboard-section-heading">
        <Link to="/shopping-list">
          <Icon name="cart" size={16} />
          Shopping
        </Link>
        <button
          type="button"
          className="icon-btn"
          aria-label="Add shopping item"
          onClick={() => setAddItemOpen(true)}
        >
          <Icon name="plus" size={16} />
        </button>
      </h2>

      {loaded && customItemsLoaded && allUnboughtRows.length > 0 && (
        <p className="dashboard-section-summary">
          Total: {totalCostCurrency ? getCurrencySymbol(totalCostCurrency) : ''}
          {totalCost.toFixed(2)}
        </p>
      )}

      {!loaded || !customItemsLoaded ? (
        <LoadingIndicator />
      ) : unboughtMealRows.length === 0 && unboughtAdditionalRows.length === 0 ? (
        <p>Nothing to buy today.</p>
      ) : (
        <>
          {unboughtMealRows.length > 0 && (
            <>
              <h3 className="form-section-heading">From Meals</h3>
              {renderTable(unboughtMealRows, false)}
            </>
          )}
          {unboughtAdditionalRows.length > 0 && (
            <>
              <h3 className="form-section-heading">Additional</h3>
              {renderTable(unboughtAdditionalRows, true)}
            </>
          )}
        </>
      )}

      <Link to="/shopping-list" className="btn btn-secondary btn-full">
        <Icon name="cart" size={16} />
        View Shopping List
      </Link>

      <AddShoppingItemModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onAdd={handleAddItem}
        defaultCurrency={totalCostCurrency ?? 'USD'}
      />
    </section>
  )
}

export default TodayShoppingSection
