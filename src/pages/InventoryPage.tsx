import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addDoc, collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import AddInventoryBatchModal, {
  type InitialOtherBatch,
} from '../components/AddInventoryBatchModal.tsx'
import CameraCaptureModal from '../components/CameraCaptureModal.tsx'
import GroupInventorySection from '../components/GroupInventorySection.tsx'
import Icon from '../components/Icon.tsx'
import InventoryBatchTable from '../components/InventoryBatchTable.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import InventoryHistoryModal from '../components/InventoryHistoryModal.tsx'
import ReceiptReviewModal from '../components/ReceiptReviewModal.tsx'
import type { FoodListItem } from '../hooks/useFoodRows.ts'
import { useDoses } from '../hooks/useDoses.ts'
import { useGroups } from '../hooks/useGroups.ts'
import { useInventoryBatches } from '../hooks/useInventoryBatches.ts'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import { buildReceiptReviewRows, type ReceiptReviewRow } from '../lib/receiptMatch.ts'
import { scanReceipt } from '../lib/receiptScan.ts'
import type { InventoryBatchDocument, InventoryBatchItem } from '../types/food.ts'
import './pages.css'

type InventoryNavState = {
  /** Set by the Shopping List when the user clicks a food row that still needs buying, so this page can jump straight to logging a purchase for that food. */
  focusFoodId?: string
  /** Set instead of `focusFoodId` when the clicked row is a hand-typed ("Additional") Shopping List item, which has no linked food. */
  focusOther?: InitialOtherBatch
  /** Set alongside `focusFoodId`/`focusOther` when the Shopping List click came from a page (e.g. the Dashboard) that wants the user brought back to it, not left on Inventory, once the batch is logged. */
  returnTo?: string
}

function sortByNameThenDate(items: InventoryBatchItem[]): InventoryBatchItem[] {
  return [...items].sort(
    (a, b) =>
      a.foodName.localeCompare(b.foodName) ||
      a.purchasedAt.localeCompare(b.purchasedAt),
  )
}

function InventoryPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { batches, loaded: batchesLoaded } = useInventoryBatches()
  const { doses, loaded: dosesLoaded } = useDoses()
  const { groups } = useGroups()
  const { dateFormat } = useUserSettings()
  const [foods, setFoods] = useState<FoodListItem[]>([])
  const [foodsLoaded, setFoodsLoaded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addInitialFoodId, setAddInitialFoodId] = useState<string | null>(null)
  const [addInitialOther, setAddInitialOther] = useState<InitialOtherBatch | null>(null)
  const [returnPath, setReturnPath] = useState<string | null>(null)
  const [historyBatch, setHistoryBatch] = useState<InventoryBatchItem | null>(null)
  const [receiptCameraOpen, setReceiptCameraOpen] = useState(false)
  const [receiptScanning, setReceiptScanning] = useState(false)
  const [receiptError, setReceiptError] = useState('')
  const [receiptReviewRows, setReceiptReviewRows] = useState<ReceiptReviewRow[]>([])
  const [receiptRetailer, setReceiptRetailer] = useState<string | null>(null)
  const [receiptReviewOpen, setReceiptReviewOpen] = useState(false)

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(collection(db, 'users', user.uid, 'foods'), (snapshot) => {
      setFoods(
        snapshot.docs.map(
          (docSnapshot) =>
            ({ id: docSnapshot.id, ...docSnapshot.data() }) as FoodListItem,
        ),
      )
      setFoodsLoaded(true)
    })
  }, [])

  // Tracks the last-applied `location.state` (not just "has this effect
  // ever run") so a second "jump to this food" click from the Shopping List
  // in the same session is still applied — Inventory no longer remounts per
  // navigation (see PageRegistry.tsx).
  const lastAppliedFocusState = useRef<unknown>(null)
  useEffect(() => {
    if (location.state === lastAppliedFocusState.current) return
    lastAppliedFocusState.current = location.state

    const navState = location.state as InventoryNavState | null
    if (navState?.focusFoodId || navState?.focusOther) {
      setAddInitialFoodId(navState.focusFoodId ?? null)
      setAddInitialOther(navState.focusOther ?? null)
      setReturnPath(navState.returnTo ?? null)
      setAddOpen(true)
      navigate(location.pathname, { replace: true })
    }
  }, [location.state, location.pathname, navigate])

  // Doses (supplements/meds) are stored as plain 'other' inventory batches
  // (see `AddDosePage.tsx`/`EditDosePage.tsx`) linked back to a dose
  // definition via `inventoryBatchId` — there's no dedicated batch `kind`
  // for them, so this set is what tells a dose's stock-tracking batch apart
  // from a true non-food "Other" item down in the table below.
  const doseBatchIds = new Set(
    doses.map((d) => d.inventoryBatchId).filter((id): id is string => !!id),
  )

  const foodBatches = sortByNameThenDate(
    batches.filter((b) => (b.kind ?? 'food') === 'food'),
  )
  const doseBatches = sortByNameThenDate(
    batches.filter(
      (b) => (b.kind ?? 'food') === 'other' && doseBatchIds.has(b.id),
    ),
  )
  const otherBatches = sortByNameThenDate(
    batches.filter(
      (b) => (b.kind ?? 'food') === 'other' && !doseBatchIds.has(b.id),
    ),
  )

  const otherItemNames = [
    ...new Set(otherBatches.map((b) => b.foodName)),
  ].sort((a, b) => a.localeCompare(b))

  async function handleAdd(batch: InventoryBatchDocument) {
    const user = auth.currentUser
    if (!user) return

    // "Remaining" starts equal to what was purchased — this seeds its
    // history with one entry; the user adjusts it from here as it gets
    // used up (and `reconcileInventory` adds its own entries as meals
    // consume it — see lib/inventoryReconcile.ts). Never affects cost,
    // only whether the Shopping List reads this food as bought or needed.
    await addDoc(collection(db, 'users', user.uid, 'inventory'), {
      ...batch,
      remainingHistory: [{ amount: batch.amount, timestamp: Date.now() }],
    })
  }

  /**
   * The modal's own `onClose` — fires whether the user cancels outright or
   * successfully submits (`AddInventoryBatchModal` calls `onClose` itself
   * right after a successful `onAdd`), so a single path covers both: on a
   * "jump straight to logging this" trip from another page (`returnPath`
   * set), either way sends the user back where they came from instead of
   * leaving them on Inventory.
   */
  function closeAddModal() {
    setAddOpen(false)
    const target = returnPath
    setAddInitialFoodId(null)
    setAddInitialOther(null)
    setReturnPath(null)
    if (target) navigate(target)
  }

  async function handleScanReceipt(imagesBase64: string[]) {
    setReceiptCameraOpen(false)
    setReceiptError('')
    setReceiptScanning(true)
    try {
      const receipt = await scanReceipt(imagesBase64)
      if (receipt.items.length === 0) {
        setReceiptError(
          "Couldn't read a receipt in that photo. Try a clearer, well-lit picture.",
        )
        return
      }
      setReceiptRetailer(receipt.retailer)
      setReceiptReviewRows(buildReceiptReviewRows(receipt.items, foods, batches))
      setReceiptReviewOpen(true)
    } catch {
      setReceiptError('Something went wrong scanning the receipt. Please try again.')
    } finally {
      setReceiptScanning(false)
    }
  }

  async function handleConfirmReceipt(newBatches: InventoryBatchDocument[]) {
    for (const batch of newBatches) {
      await handleAdd(batch)
    }
  }

  function openAddModal() {
    setAddInitialFoodId(null)
    setAddInitialOther(null)
    setReturnPath(null)
    setAddOpen(true)
  }

  const user = auth.currentUser

  return (
    <>
      <PageLayout header={<h1>Inventory</h1>}>
        <div className="inventory-add-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={openAddModal}
          >
            <Icon name="plus" size={16} />
            Add to Inventory
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setReceiptCameraOpen(true)}
            disabled={receiptScanning}
          >
            <Icon name="camera" size={16} />
            {receiptScanning ? 'Scanning...' : 'Scan Shopping Receipt'}
          </button>
        </div>
        {receiptError && <p className="form-error">{receiptError}</p>}

        {!foodsLoaded || !batchesLoaded || !dosesLoaded ? (
          <LoadingIndicator />
        ) : batches.length === 0 ? (
          <p>No items in your inventory yet.</p>
        ) : (
          <>
            {foodBatches.length > 0 && user && (
              <>
                <h2 className="form-section-heading">Foods</h2>
                <InventoryBatchTable
                  batches={foodBatches}
                  basePath={['users', user.uid, 'inventory']}
                  dateFormat={dateFormat}
                  onViewHistory={setHistoryBatch}
                />
              </>
            )}
            {doseBatches.length > 0 && user && (
              <>
                <h2 className="form-section-heading">Supplements &amp; Meds</h2>
                <InventoryBatchTable
                  batches={doseBatches}
                  basePath={['users', user.uid, 'inventory']}
                  dateFormat={dateFormat}
                  onViewHistory={setHistoryBatch}
                />
              </>
            )}
            {otherBatches.length > 0 && user && (
              <>
                <h2 className="form-section-heading">Other</h2>
                <InventoryBatchTable
                  batches={otherBatches}
                  basePath={['users', user.uid, 'inventory']}
                  dateFormat={dateFormat}
                  onViewHistory={setHistoryBatch}
                />
              </>
            )}
          </>
        )}

        {groups.filter((group) => group.sharedInventoryEnabled).map((group) => (
          <GroupInventorySection
            key={group.id}
            group={group}
            foods={foods}
            dateFormat={dateFormat}
            onViewHistory={setHistoryBatch}
            onCreateNewFood={() => navigate('/add-food')}
          />
        ))}
      </PageLayout>

      <AddInventoryBatchModal
        open={addOpen}
        onClose={closeAddModal}
        foods={foods}
        onAdd={handleAdd}
        onCreateNewFood={() => navigate('/add-food')}
        initialFoodId={addInitialFoodId}
        initialOther={addInitialOther}
      />

      <InventoryHistoryModal
        open={historyBatch !== null}
        onClose={() => setHistoryBatch(null)}
        batch={historyBatch}
      />

      <CameraCaptureModal
        open={receiptCameraOpen}
        onClose={() => setReceiptCameraOpen(false)}
        onCapture={handleScanReceipt}
      />

      <ReceiptReviewModal
        open={receiptReviewOpen}
        onClose={() => setReceiptReviewOpen(false)}
        initialRows={receiptReviewRows}
        retailer={receiptRetailer}
        foods={foods}
        otherItemNames={otherItemNames}
        onConfirm={handleConfirmReceipt}
      />
    </>
  )
}

export default InventoryPage
