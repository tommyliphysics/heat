import type { EnergyUnit, Micronutrient, MicronutrientUnit } from '../types/food.ts'
import type { FoodFormValues } from './food.ts'
import { normalizeQuantityUnit } from './units.ts'

const SCAN_ENDPOINT = 'https://op9vhhlja2.execute-api.us-east-1.amazonaws.com/'

export type ScannedNutritionDetail = {
  detail: string
  amount: number
  unit: string
}

/**
 * Posts one or more nutrition-label photos (base64, no data-URL prefix) to
 * the label-scanning API and returns its flat detail list. Multiple photos
 * are treated server-side as the same label shot in pieces (e.g. it wraps
 * around a curved surface and doesn't fit in one frame) and merged into a
 * single result, not scanned separately.
 */
export async function scanNutritionLabel(
  imagesBase64: string[],
): Promise<ScannedNutritionDetail[]> {
  const response = await fetch(SCAN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: imagesBase64 }),
  })

  const result = await response.json()
  if (!response.ok || result.success === false) {
    throw new Error(result.error || 'Failed to scan nutrition label')
  }

  return (result.data ?? []) as ScannedNutritionDetail[]
}

const ENERGY_UNIT_ALIASES: Record<string, EnergyUnit> = {
  cal: 'cal',
  cals: 'cal',
  calorie: 'cal',
  calories: 'cal',
  kcal: 'cal',
  kj: 'kJ',
  kilojoule: 'kJ',
  kilojoules: 'kJ',
}

function normalizeEnergyUnit(unit: string): EnergyUnit {
  return ENERGY_UNIT_ALIASES[unit.trim().toLowerCase()] ?? 'cal'
}

const MICRONUTRIENT_UNIT_ALIASES: Record<string, MicronutrientUnit> = {
  g: 'g',
  mg: 'mg',
  ug: 'ug',
  mcg: 'ug',
  'µg': 'ug',
}

function normalizeMicronutrientUnit(unit: string): MicronutrientUnit {
  return MICRONUTRIENT_UNIT_ALIASES[unit.trim().toLowerCase()] ?? 'mg'
}

/** The nutrition-facing subset of FoodFormValues a label scan can fill in; name/brand/retailer/price/currency/prices are left to the user. */
export type NutritionScanPatch = Pick<
  FoodFormValues,
  | 'quantity'
  | 'quantityUnit'
  | 'servingSize'
  | 'energy'
  | 'energyUnit'
  | 'carbohydrates'
  | 'fat'
  | 'protein'
  | 'micronutrients'
>

/**
 * Maps the API's flat {detail, amount, unit} list onto FoodForm's fields.
 * 'Serving Size' becomes the quantity/servingSize; 'Energy', 'Carbohydrates',
 * 'Total Fat' and 'Protein' become their matching fields; every other detail
 * (Sodium, Calcium, Vitamin C, ...) becomes a micronutrient row. Micronutrients
 * are replaced wholesale, same as loading a public-food reference does.
 */
export function nutritionScanToFormPatch(
  details: ScannedNutritionDetail[],
  current: NutritionScanPatch,
): NutritionScanPatch {
  const patch: NutritionScanPatch = { ...current }
  const micronutrients: Micronutrient[] = []

  for (const { detail, amount, unit } of details) {
    switch (detail) {
      case 'Serving Size': {
        patch.quantity = String(amount)
        patch.servingSize = `${amount} ${unit}`.trim()
        const quantityUnit = normalizeQuantityUnit(unit)
        if (quantityUnit) patch.quantityUnit = quantityUnit
        break
      }
      case 'Energy':
        patch.energy = String(amount)
        patch.energyUnit = normalizeEnergyUnit(unit)
        break
      case 'Carbohydrates':
        patch.carbohydrates = String(amount)
        break
      case 'Total Fat':
        patch.fat = String(amount)
        break
      case 'Protein':
        patch.protein = String(amount)
        break
      default:
        micronutrients.push({
          id: crypto.randomUUID(),
          name: detail,
          amount: String(amount),
          unit: normalizeMicronutrientUnit(unit),
        })
    }
  }

  patch.micronutrients = micronutrients
  return patch
}
