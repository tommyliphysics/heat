import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.tsx'

type CameraCaptureModalProps = {
  open: boolean
  onClose: () => void
  /** base64 image data for each photo taken/uploaded this session, no data-URL prefix. */
  onCapture: (imagesBase64: string[]) => void
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * A camera view we control (rather than handing off to the OS camera app),
 * so an "upload instead" option can live on the same screen as the live
 * preview. Supports taking (or uploading) several photos of the same label
 * in one session — a label can wrap around a curved surface or otherwise
 * not fit in a single frame — collected as thumbnails the user can remove
 * before submitting them all together. Falls back to just the upload
 * option when the camera can't be opened (permission denied, no camera,
 * unsupported browser).
 */
function CameraCaptureModal({ open, onClose, onCapture }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [ready, setReady] = useState(false)
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    if (!open) return

    setCameraError('')
    setReady(false)
    setImages([])
    let cancelled = false

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera not available on this browser. Upload a photo instead.')
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError('Could not access the camera. Upload a photo instead.')
        }
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [open])

  function handleCapture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    setImages((current) => [...current, canvas.toDataURL('image/jpeg', 0.92)])
  }

  function handleRemove(index: number) {
    setImages((current) => current.filter((_, i) => i !== index))
  }

  function handleDone() {
    if (images.length === 0) return
    onCapture(images.map((img) => img.split(',')[1]))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return

    const dataUrls = await Promise.all(files.map(readFileAsDataUrl))
    setImages((current) => [...current, ...dataUrls])
  }

  if (!open) return null

  return (
    <div className="camera-overlay">
      <div className="camera-modal">
        <button
          type="button"
          className="camera-close"
          onClick={onClose}
          aria-label="Close camera"
        >
          &times;
        </button>

        {cameraError ? (
          <div className="camera-error">
            <p>{cameraError}</p>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
        )}

        {images.length > 0 && (
          <ul className="camera-thumbnails">
            {images.map((img, i) => (
              <li key={i} className="camera-thumbnail">
                <img src={img} alt={`Label photo ${i + 1}`} />
                <button
                  type="button"
                  className="camera-thumbnail-remove"
                  onClick={() => handleRemove(i)}
                  aria-label={`Remove photo ${i + 1}`}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="camera-controls">
          <button
            type="button"
            className="camera-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload image instead"
          >
            <Icon name="image" size={20} />
          </button>

          {!cameraError && (
            <button
              type="button"
              className="camera-capture-btn"
              onClick={handleCapture}
              disabled={!ready}
              aria-label="Take photo"
            />
          )}

          {images.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleDone}
            >
              Use {images.length} Photo{images.length > 1 ? 's' : ''}
            </button>
          ) : (
            <span className="camera-controls-spacer" aria-hidden="true" />
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  )
}

export default CameraCaptureModal
