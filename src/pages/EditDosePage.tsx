import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import DoseForm from '../components/DoseForm.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { useRouteParam } from '../hooks/useRouteParam.ts'
import {
  buildDoseDocument,
  doseDocumentToFormValues,
  type DoseFormValues,
} from '../lib/doses.ts'
import { latestRemaining } from '../lib/inventory.ts'
import { toDateStr } from '../lib/timeline.ts'
import type { DoseDocument } from '../types/doses.ts'
import type { InventoryBatchDocument } from '../types/food.ts'

function EditDosePage() {
  const doseId = useRouteParam('/doses/:doseId/edit', 'doseId')
  const navigate = useNavigate()
  const [values, setValues] = useState<DoseFormValues | null>(null)
  const [record, setRecord] = useState<DoseDocument | null>(null)
  const [inventoryBatchId, setInventoryBatchId] = useState<string | undefined>(
    undefined,
  )
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const user = auth.currentUser
    if (!user || !doseId) return

    // See EditFoodPage.tsx's identical fix: clears the previous dose's
    // values immediately so switching directly between two doses' edit
    // pages doesn't seed the freshly `key`-remounted DoseForm with stale
    // data through the async gap before this fetch resolves.
    setValues(null)

    getDoc(doc(db, 'users', user.uid, 'doses', doseId)).then(async (snapshot) => {
      if (!snapshot.exists()) {
        setNotFound(true)
        return
      }
      const loaded = snapshot.data() as DoseDocument
      setRecord(loaded)
      setInventoryBatchId(loaded.inventoryBatchId)

      let currentStock = ''
      if (loaded.inventoryBatchId) {
        const batchSnapshot = await getDoc(
          doc(db, 'users', user.uid, 'inventory', loaded.inventoryBatchId),
        )
        if (batchSnapshot.exists()) {
          currentStock = latestRemaining(
            batchSnapshot.data() as InventoryBatchDocument,
          )
        }
      }
      setValues(doseDocumentToFormValues(loaded, currentStock))
    })
  }, [doseId])

  async function handleSave(formValues: DoseFormValues) {
    const user = auth.currentUser
    if (!user || !doseId) return

    const update: Record<string, unknown> = {
      ...buildDoseDocument(formValues, record?.customSchedule),
    }
    // Toggling schedule type leaves the other type's fields behind unless
    // explicitly cleared — without this, switching back and forth could
    // resurrect a stale `doseTimes`/`customSchedule` from an earlier save.
    if (formValues.scheduleType === 'recurring') {
      update.customSchedule = deleteField()
    } else {
      update.doseTimes = deleteField()
      update.dosesPerDay = deleteField()
    }

    const newStock = formValues.currentStock.trim()

    if (inventoryBatchId) {
      // Already tracked — a changed count is a manual correction, appended
      // to the existing batch's history like any other Inventory edit.
      if (newStock) {
        const batchRef = doc(db, 'users', user.uid, 'inventory', inventoryBatchId)
        const batchSnapshot = await getDoc(batchRef)
        if (batchSnapshot.exists()) {
          const batch = batchSnapshot.data() as InventoryBatchDocument
          if (latestRemaining(batch) !== newStock) {
            await updateDoc(batchRef, {
              remainingHistory: [
                ...(batch.remainingHistory ?? []),
                { amount: newStock, timestamp: Date.now() },
              ],
            })
          }
        }
      }
    } else if (newStock) {
      // Not tracked yet — a count entered now turns tracking on.
      const batch: InventoryBatchDocument = {
        kind: 'other',
        foodName: formValues.name,
        amount: newStock,
        unit: '',
        price: '0',
        currency: 'USD',
        purchasedAt: toDateStr(new Date()),
        remainingHistory: [{ amount: newStock, timestamp: Date.now() }],
      }
      const batchRef = await addDoc(
        collection(db, 'users', user.uid, 'inventory'),
        batch,
      )
      update.inventoryBatchId = batchRef.id
    }

    await updateDoc(doc(db, 'users', user.uid, 'doses', doseId), update)
    navigate('/doses')
  }

  async function handleDelete() {
    const user = auth.currentUser
    if (!user || !doseId) return

    await deleteDoc(doc(db, 'users', user.uid, 'doses', doseId))
    navigate('/doses')
  }

  if (notFound) {
    return (
      <section className="page page-center">
        <h1>Dose not found</h1>
      </section>
    )
  }

  if (!values) {
    return (
      <PageLayout header={<h1>Edit Dose</h1>}>
        <LoadingIndicator />
      </PageLayout>
    )
  }

  return (
    <DoseForm
      key={doseId}
      title="Edit Dose"
      submitLabel="Save Changes"
      savingLabel="Saving..."
      initialValues={values}
      onSubmit={handleSave}
      onDelete={handleDelete}
      resetOnSuccess={false}
    />
  )
}

export default EditDosePage
