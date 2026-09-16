const SCAN_ENDPOINT = 'https://zweoi6i7z0.execute-api.us-east-1.amazonaws.com/'

export type ScannedReceiptItem = {
  name: string
  /** Brand/store-label the AI separated out from `name` (e.g. "Coles" from "Coles Ricotta") — null when none was discernible. Splitting it out is what lets `name` alone match a generic product database entry like "Ricotta". */
  brand: string | null
  cost: number
  amount: number
  unit: string
}

export type ScannedReceipt = {
  retailer: string | null
  items: ScannedReceiptItem[]
}

/**
 * Posts one or more shopping-receipt photos (base64, no data-URL prefix) to
 * the receipt-scanning API and returns the retailer name plus its
 * aggregated (duplicate lines combined) item list. Multiple photos are
 * treated server-side as the same receipt shot in pieces and merged into a
 * single result, not scanned separately — see `backend/scan-receipt-lambda`.
 */
export async function scanReceipt(imagesBase64: string[]): Promise<ScannedReceipt> {
  const response = await fetch(SCAN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: imagesBase64 }),
  })

  const result = await response.json()
  if (!response.ok || result.success === false) {
    throw new Error(result.error || 'Failed to scan receipt')
  }

  const data = result.data ?? {}
  const items: ScannedReceiptItem[] = Array.isArray(data.items) ? data.items : []
  return {
    retailer: typeof data.retailer === 'string' ? data.retailer : null,
    items: items.map((item) => ({
      ...item,
      brand: typeof item.brand === 'string' && item.brand.trim() ? item.brand : null,
    })),
  }
}
