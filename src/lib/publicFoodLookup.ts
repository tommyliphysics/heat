import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { EMPTY_FOOD_FORM_VALUES, type FoodFormValues } from './food.ts'
import type { EnergyUnit, MicronutrientUnit, PublicFoodDocument } from '../types/food.ts'

export type PublicFoodListItem = PublicFoodDocument & { id: string }

type NutrientDetail = { unit: string; amount: number }

/**
 * Raw shape of a doc in public/publicNutritionData/foods — flattened, one
 * key per nutrient rather than the app's nested macro/micronutrient split.
 * Each nutrient key matches the `Nutrient` column of
 * data/nutrient_label_mapping.csv (e.g. "Energy", "Protein", "Total Fat",
 * "Carbohydrates", "Sodium", ...). `amount` comes back as a plain JS number
 * regardless of the np.float64 it was written as.
 */
type RawPublicFoodDocument = {
  name: string
  source?: string
} & Record<string, NutrientDetail | string | undefined>

// The four macronutrient keys live at the top level of the app's normalized
// shape (energy/macronutrients); everything else flattens into micronutrients.
const ENERGY_KEY = 'Energy'
const CARBS_KEY = 'Carbohydrates'
const FAT_KEY = 'Total Fat'
const PROTEIN_KEY = 'Protein'
const NON_MICRONUTRIENT_KEYS = new Set([
  'name',
  'source',
  ENERGY_KEY,
  CARBS_KEY,
  FAT_KEY,
  PROTEIN_KEY,
])

function isNutrientDetail(value: unknown): value is NutrientDetail {
  return typeof value === 'object' && value !== null && 'amount' in value && 'unit' in value
}

function normalizeAmount(amount: unknown): string {
  return typeof amount === 'number' ? String(amount) : (amount as string)
}

function detailAmount(detail: NutrientDetail | undefined): string {
  return detail ? normalizeAmount(detail.amount) : '0'
}

function normalizePublicFood(
  id: string,
  data: RawPublicFoodDocument,
): PublicFoodListItem {
  const energy = data[ENERGY_KEY]
  const carbs = data[CARBS_KEY]
  const fat = data[FAT_KEY]
  const protein = data[PROTEIN_KEY]

  const micronutrients: Record<string, { amount: string; unit: MicronutrientUnit }> = {}
  for (const [key, value] of Object.entries(data)) {
    if (NON_MICRONUTRIENT_KEYS.has(key) || !isNutrientDetail(value)) continue
    micronutrients[key] = {
      amount: normalizeAmount(value.amount),
      unit: value.unit as MicronutrientUnit,
    }
  }

  return {
    id,
    name: data.name,
    source: data.source ?? '',
    energy: {
      amount: detailAmount(isNutrientDetail(energy) ? energy : undefined),
      unit: (isNutrientDetail(energy) ? energy.unit : 'kJ') as EnergyUnit,
    },
    macronutrients: {
      carbs: { amount: detailAmount(isNutrientDetail(carbs) ? carbs : undefined), unit: 'g' },
      fat: { amount: detailAmount(isNutrientDetail(fat) ? fat : undefined), unit: 'g' },
      protein: {
        amount: detailAmount(isNutrientDetail(protein) ? protein : undefined),
        unit: 'g',
      },
    },
    micronutrients,
  }
}

/**
 * Maps a reference food onto the Add/Edit Food form's own value shape — only
 * ever fills in nutrition (quantity fixed at 100g, matching how reference
 * data is recorded), leaving brand/price/serving-size for the user to enter
 * themselves, same as `FoodForm.tsx`'s existing in-form "Load data from
 * {source}" autocomplete already does (this is that same mapping, pulled out
 * so the Foods page's Reference tab can reuse it for its own "Add" flow).
 */
export function publicFoodToFormValues(food: PublicFoodListItem): FoodFormValues {
  return {
    ...EMPTY_FOOD_FORM_VALUES,
    name: food.name,
    quantity: '100',
    quantityUnit: 'g',
    energy: food.energy.amount,
    energyUnit: food.energy.unit,
    carbohydrates: food.macronutrients.carbs.amount,
    fat: food.macronutrients.fat.amount,
    protein: food.macronutrients.protein.amount,
    micronutrients: Object.entries(food.micronutrients ?? {}).map(([name, m]) => ({
      id: crypto.randomUUID(),
      name,
      amount: m.amount,
      unit: m.unit,
    })),
  }
}

/**
 * Fetches full nutrition data for one reference food by exact name — a
 * single-document Firestore query, only run once the user actually picks a
 * result from the local name-index autocomplete (see `useFoodNameIndex`),
 * rather than loading the whole public collection up front.
 */
export async function fetchPublicFoodByName(
  name: string,
): Promise<PublicFoodListItem | null> {
  const snapshot = await getDocs(
    query(
      collection(db, 'public', 'publicNutritionData', 'foods'),
      where('name', '==', name),
      limit(1),
    ),
  )

  const doc = snapshot.docs[0]
  if (!doc) return null

  return normalizePublicFood(doc.id, doc.data() as RawPublicFoodDocument)
}
