import { useNavigate } from 'react-router-dom'
import { addDoc, collection } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import DoseForm from '../components/DoseForm.tsx'
import { buildDoseDocument, type DoseFormValues } from '../lib/doses.ts'
import { toDateStr } from '../lib/timeline.ts'
import type { DoseDocument } from '../types/doses.ts'
import type { InventoryBatchDocument } from '../types/food.ts'

function AddDosePage() {
  const navigate = useNavigate()

  async function handleSave(values: DoseFormValues) {
    const user = auth.currentUser
    if (!user) return

    const doseData: DoseDocument & { createdAt: number } = {
      ...buildDoseDocument(values),
      createdAt: Date.now(),
    }

    if (values.currentStock.trim()) {
      const batch: InventoryBatchDocument = {
        kind: 'other',
        foodName: values.name,
        amount: values.currentStock,
        unit: '',
        price: '0',
        currency: 'USD',
        purchasedAt: toDateStr(new Date()),
        remainingHistory: [
          { amount: values.currentStock, timestamp: Date.now() },
        ],
      }
      const batchRef = await addDoc(
        collection(db, 'users', user.uid, 'inventory'),
        batch,
      )
      doseData.inventoryBatchId = batchRef.id
    }

    await addDoc(collection(db, 'users', user.uid, 'doses'), doseData)
    navigate('/doses')
  }

  return (
    <DoseForm
      title="Add Dose"
      submitLabel="Add Dose"
      savingLabel="Adding..."
      onSubmit={handleSave}
      resetOnSuccess={false}
    />
  )
}

export default AddDosePage
