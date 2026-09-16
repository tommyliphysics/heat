import { normalizeQuantityUnit } from './units.ts'
import type { ScannedReceiptItem } from './receiptScan.ts'
import type { FoodListItem } from '../hooks/useFoodRows.ts'
import type { InventoryBatchItem, QuantityUnit } from '../types/food.ts'

export type ReceiptMatch =
  | { status: 'food'; food: FoodListItem }
  | { status: 'other'; existingName: string }
  | { status: 'new' }

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Matches a scanned receipt item's name against existing My Foods records
 * first, then existing "Other" inventory item names, so a recognized item
 * is classified the same way it's already being tracked. Falls back to
 * 'new' — the caller defaults that to a fresh "Other" item — when neither
 * has a matching name. Exact (case/whitespace-insensitive) matching only;
 * OCR text that's close-but-not-identical to a saved name won't match.
 */
export function matchReceiptItem(
  name: string,
  foods: FoodListItem[],
  otherBatches: InventoryBatchItem[],
): ReceiptMatch {
  const food = foods.find((f) => namesMatch(f.name, name))
  if (food) return { status: 'food', food }

  const otherMatch = otherBatches.find((b) => namesMatch(b.foodName, name))
  if (otherMatch) return { status: 'other', existingName: otherMatch.foodName }

  return { status: 'new' }
}

/** Best-effort mapping of the scan API's free-text unit (e.g. "g", "kg", "ea") onto the app's QuantityUnit enum — falls back to '' (the whole-item/"ea" unit) for anything unrecognized, since that's always a safe, always-available choice. */
export function normalizeReceiptUnit(unit: string): QuantityUnit {
  if (unit.trim().toLowerCase() === 'ea') return ''
  return normalizeQuantityUnit(unit) ?? ''
}

export type ReceiptReviewRow = {
  /** Local-only id (not a Firestore id) for React keys and row removal before anything's saved. */
  id: string
  status: 'food' | 'other' | 'new'
  kind: 'food' | 'other'
  /** Set only when `kind` is 'food'. */
  foodId?: string
  name: string
  amount: string
  unit: QuantityUnit
  price: string
}

/** Recombines a scanned item's brand-stripped name with its brand for display/storage — used only when nothing matched, so a genuinely new item doesn't lose useful specificity (e.g. "Coles Ricotta" rather than a bare "Ricotta") just because splitting the brand out is what let matching try the clean name in the first place. */
function nameWithBrand(item: ScannedReceiptItem): string {
  return item.brand ? `${item.brand} ${item.name}`.trim() : item.name
}

/** Turns a scanned receipt's items into editable review rows, pre-matched against My Foods and existing "Other" inventory items (see `matchReceiptItem`). Matching itself always uses the item's brand-stripped `name` (see `ScannedReceiptItem`) — a receipt line like "Coles Ricotta" matches a "Ricotta" food even though the brand was on the label. */
export function buildReceiptReviewRows(
  items: ScannedReceiptItem[],
  foods: FoodListItem[],
  batches: InventoryBatchItem[],
): ReceiptReviewRow[] {
  const otherBatches = batches.filter((b) => (b.kind ?? 'food') === 'other')

  return items.map((item) => {
    const match = matchReceiptItem(item.name, foods, otherBatches)
    const base = {
      id: crypto.randomUUID(),
      amount: String(item.amount),
      unit: normalizeReceiptUnit(item.unit),
      price: String(item.cost),
    }

    if (match.status === 'food') {
      return {
        ...base,
        status: 'food' as const,
        kind: 'food' as const,
        foodId: match.food.id,
        name: match.food.name,
      }
    }
    if (match.status === 'other') {
      return {
        ...base,
        status: 'other' as const,
        kind: 'other' as const,
        name: match.existingName,
      }
    }
    return {
      ...base,
      status: 'new' as const,
      kind: 'other' as const,
      name: nameWithBrand(item),
    }
  })
}

/** A blank row for the review list's "add an item the scan missed" action. */
export function makeBlankReceiptRow(): ReceiptReviewRow {
  return {
    id: crypto.randomUUID(),
    status: 'new',
    kind: 'other',
    name: '',
    amount: '',
    unit: '',
    price: '',
  }
}
