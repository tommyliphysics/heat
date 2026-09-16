import { useState } from 'react'
import { addDoc, collection } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import type { FoodListItem } from '../hooks/useFoodRows.ts'
import { useGroupInventoryBatches } from '../hooks/useGroupInventoryBatches.ts'
import { useGroupMembers } from '../hooks/useGroupMembers.ts'
import { normalizedFoodKey } from '../lib/food.ts'
import {
  describeSharedItemDiff,
  establishSharedItem,
  fetchSharedItem,
  sharedItemFieldsEqual,
  sharedItemFieldsOf,
  syncFoodToSharedItem,
  type SharedItemDiffRow,
} from '../lib/sharedItems.ts'
import type { SharedItemDocument, GroupListItem } from '../types/groups.ts'
import type { InventoryBatchDocument, InventoryBatchItem } from '../types/food.ts'
import type { DateFormat } from '../types/settings.ts'
import AddInventoryBatchModal from './AddInventoryBatchModal.tsx'
import ChargeModal from './ChargeModal.tsx'
import Icon from './Icon.tsx'
import InventoryBatchTable from './InventoryBatchTable.tsx'
import LoadingIndicator from './LoadingIndicator.tsx'
import MismatchModal from './MismatchModal.tsx'

type GroupInventorySectionProps = {
  group: GroupListItem
  /** The signed-in user's own foods — same picker as personal inventory (see the "Add to Inventory" flow's design note: a group batch always links to the *adder's own* food record; cross-member consumption matching happens later by name+brand, not by sharing the food record itself). */
  foods: FoodListItem[]
  dateFormat: DateFormat
  onViewHistory: (batch: InventoryBatchItem) => void
  onCreateNewFood: () => void
}

type PendingMismatch = {
  batch: InventoryBatchDocument
  food: FoodListItem
  sharedItem: SharedItemDocument
  diff: SharedItemDiffRow[]
}

type PendingCharge = {
  batchId: string
  foodName: string
  currency: string
}

function sortByNameThenDate(items: InventoryBatchItem[]): InventoryBatchItem[] {
  return [...items].sort(
    (a, b) =>
      a.foodName.localeCompare(b.foodName) ||
      a.purchasedAt.localeCompare(b.purchasedAt),
  )
}

/** One group's shared inventory — Foods and Other sections (no Supplements & Meds split: a dose's stock is inherently personal, never logged to a shared group inventory), each backed by `InventoryBatchTable` pointed at `groups/{groupId}/inventory` so every edit here is immediately visible to, and editable by, every other member. */
function GroupInventorySection({
  group,
  foods,
  dateFormat,
  onViewHistory,
  onCreateNewFood,
}: GroupInventorySectionProps) {
  const { batches, loaded } = useGroupInventoryBatches(group.id)
  const { members } = useGroupMembers(group.id)
  const [addOpen, setAddOpen] = useState(false)
  const [mismatch, setMismatch] = useState<PendingMismatch | null>(null)
  const [pendingCharge, setPendingCharge] = useState<PendingCharge | null>(null)

  const foodBatches = sortByNameThenDate(
    batches.filter((b) => (b.kind ?? 'food') === 'food'),
  )
  const otherBatches = sortByNameThenDate(
    batches.filter((b) => (b.kind ?? 'food') === 'other'),
  )

  /** Adds the batch to the shared inventory and, if it landed successfully, offers the "charge others?" prompt — never shown for a batch rerouted to the adder's own personal inventory instead (see `handleAddMismatchToPersonal`), since that's no longer a shared purchase. */
  async function addToGroup(batch: InventoryBatchDocument) {
    const docRef = await addDoc(collection(db, 'groups', group.id, 'inventory'), {
      ...batch,
      remainingHistory: [{ amount: batch.amount, timestamp: Date.now() }],
    })
    setPendingCharge({ batchId: docRef.id, foodName: batch.foodName, currency: batch.currency })
  }

  async function addToPersonal(uid: string, batch: InventoryBatchDocument) {
    await addDoc(collection(db, 'users', uid, 'inventory'), {
      ...batch,
      remainingHistory: [{ amount: batch.amount, timestamp: Date.now() }],
    })
  }

  /**
   * A food-kind batch first checks whether this group already has an
   * established shared version of that (name, brand) — see
   * `lib/sharedItems.ts`. No shared item yet: this add establishes it and
   * proceeds normally. Matches: proceeds normally. Mismatched: held back —
   * `MismatchModal` takes over and decides where the batch actually ends
   * up (see its two resolution paths below).
   */
  async function handleAdd(batch: InventoryBatchDocument) {
    const user = auth.currentUser
    const food = batch.foodId ? foods.find((f) => f.id === batch.foodId) : undefined

    if (user && batch.kind === 'food' && food) {
      const key = normalizedFoodKey(food.name, food.brand)
      const sharedItem = await fetchSharedItem(group.id, key)

      if (!sharedItem) {
        await establishSharedItem(group.id, food, user.uid)
      } else {
        const mine = sharedItemFieldsOf(food)
        const theirs = {
          quantity: sharedItem.quantity,
          energy: sharedItem.energy,
          macronutrients: sharedItem.macronutrients,
          micronutrients: sharedItem.micronutrients,
          price: sharedItem.price,
        }
        if (!sharedItemFieldsEqual(mine, theirs)) {
          setMismatch({ batch, food, sharedItem, diff: describeSharedItemDiff(mine, theirs) })
          return
        }
      }
    }

    await addToGroup(batch)
  }

  async function handleSyncAndAdd() {
    const user = auth.currentUser
    if (!user || !mismatch) return

    await syncFoodToSharedItem(user.uid, mismatch.food.id, mismatch.sharedItem)
    await addToGroup(mismatch.batch)
    setMismatch(null)
  }

  async function handleAddMismatchToPersonal() {
    const user = auth.currentUser
    if (!user || !mismatch) return

    await addToPersonal(user.uid, mismatch.batch)
    setMismatch(null)
  }

  const basePath = ['groups', group.id, 'inventory']
  const otherMembers = members.filter((m) => m.uid !== auth.currentUser?.uid)

  return (
    <>
      <h2 className="form-section-heading">{group.name} (Shared)</h2>
      <div className="inventory-add-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setAddOpen(true)}
        >
          <Icon name="plus" size={16} />
          Add to {group.name}
        </button>
      </div>

      {!loaded ? (
        <LoadingIndicator />
      ) : batches.length === 0 ? (
        <p>No items in {group.name}'s inventory yet.</p>
      ) : (
        <>
          {foodBatches.length > 0 && (
            <InventoryBatchTable
              batches={foodBatches}
              basePath={basePath}
              dateFormat={dateFormat}
              onViewHistory={onViewHistory}
            />
          )}
          {otherBatches.length > 0 && (
            <InventoryBatchTable
              batches={otherBatches}
              basePath={basePath}
              dateFormat={dateFormat}
              onViewHistory={onViewHistory}
            />
          )}
        </>
      )}

      <AddInventoryBatchModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        foods={foods}
        onAdd={handleAdd}
        onCreateNewFood={onCreateNewFood}
      />

      {mismatch && (
        <MismatchModal
          open={mismatch !== null}
          onClose={() => setMismatch(null)}
          foodName={mismatch.food.name}
          groupName={group.name}
          diff={mismatch.diff}
          onSync={handleSyncAndAdd}
          onAddToPersonal={handleAddMismatchToPersonal}
        />
      )}

      {pendingCharge && otherMembers.length > 0 && (
        <ChargeModal
          open={pendingCharge !== null}
          onClose={() => setPendingCharge(null)}
          groupId={group.id}
          batchId={pendingCharge.batchId}
          foodName={pendingCharge.foodName}
          currency={pendingCharge.currency}
          members={otherMembers}
        />
      )}
    </>
  )
}

export default GroupInventorySection
