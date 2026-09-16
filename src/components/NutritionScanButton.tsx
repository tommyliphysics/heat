import { useState } from 'react'
import CameraCaptureModal from './CameraCaptureModal.tsx'
import Icon from './Icon.tsx'
import {
  scanNutritionLabel,
  type ScannedNutritionDetail,
} from '../lib/nutritionScan.ts'

type NutritionScanButtonProps = {
  onScanned: (details: ScannedNutritionDetail[]) => void
}

function NutritionScanButton({ onScanned }: NutritionScanButtonProps) {
  const [cameraOpen, setCameraOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  async function handleCapture(imagesBase64: string[]) {
    setCameraOpen(false)
    setError('')
    setScanning(true)
    try {
      const details = await scanNutritionLabel(imagesBase64)
      if (details.length === 0) {
        setError(
          imagesBase64.length > 1
            ? "Couldn't read a nutrition label in those photos. Try clearer, well-lit pictures."
            : "Couldn't read a nutrition label in that photo. Try a clearer, well-lit picture.",
        )
        return
      }
      onScanned(details)
    } catch {
      setError('Something went wrong scanning the label. Please try again.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="nutrition-scan">
      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={() => setCameraOpen(true)}
        disabled={scanning}
      >
        <Icon name="camera" size={16} />
        {scanning ? 'Scanning...' : 'Scan Nutrition Label'}
      </button>
      {error && <p className="form-error">{error}</p>}

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCapture}
      />
    </div>
  )
}

export default NutritionScanButton
