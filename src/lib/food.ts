import { formatShortDateFromTimestamp } from './timeline.ts'
import type {
  AddedFromInfo,
  EnergyUnit,
  FoodDocument,
  Micronutrient,
  PriceRecord,
  QuantityUnit,
} from '../types/food.ts'
import type { DateFormat } from '../types/settings.ts'

export type FoodFormValues = {
  name: string
  quantity: string
  quantityUnit: QuantityUnit
  servingSize: string
  energy: string
  energyUnit: EnergyUnit
  carbohydrates: string
  fat: string
  protein: string
  micronutrients: Micronutrient[]
  brand: string
  retailer: string
  price: string
  /** How much `price` buys — defaults to the nutrition quantity, but each price record can override it (e.g. a retailer selling a different pack size). */
  priceQuantity: string
  priceQuantityUnit: QuantityUnit
  currency: string
  /** All saved price records for this food, including whichever one is currently reflected in brand/retailer/price/currency. */
  prices: PriceRecord[]
}

export const EMPTY_FOOD_FORM_VALUES: FoodFormValues = {
  name: '',
  quantity: '',
  quantityUnit: 'g',
  servingSize: '',
  energy: '',
  energyUnit: 'cal',
  carbohydrates: '',
  fat: '',
  protein: '',
  micronutrients: [],
  brand: '',
  retailer: '',
  price: '',
  priceQuantity: '',
  priceQuantityUnit: 'g',
  currency: 'USD',
  prices: [],
}

/** Adds/replaces `record` by retailer (case-insensitive), marks it `latest`, and clears `latest` on every other record. */
export function upsertPriceRecord(
  prices: PriceRecord[],
  record: PriceRecord,
): PriceRecord[] {
  const key = record.retailer.trim().toLowerCase()
  const withoutMatch = prices.filter(
    (p) => p.retailer.trim().toLowerCase() !== key,
  )
  return [
    ...withoutMatch.map((p) => ({ ...p, latest: false })),
    { ...record, latest: true },
  ]
}

export function buildFoodDocument(values: FoodFormValues): FoodDocument {
  const micronutrients = Object.fromEntries(
    values.micronutrients
      .filter((m) => m.name.trim())
      .map((m) => [m.name.trim(), { amount: m.amount, unit: m.unit }]),
  )

  const retailer = values.retailer.trim()
  const enteredQuantity = { amount: values.priceQuantity, unit: values.priceQuantityUnit }
  const prices = retailer
    ? upsertPriceRecord(values.prices, {
        retailer,
        amount: values.price,
        currency: values.currency,
        latest: true,
        quantity: enteredQuantity,
      })
    : values.prices

  const latest = prices.find((p) => p.latest)
  const brand = values.brand.trim()

  return {
    name: values.name,
    ...(brand ? { brand } : {}),
    quantity: { amount: values.quantity, unit: values.quantityUnit },
    servingSize: values.servingSize,
    energy: { amount: values.energy, unit: values.energyUnit },
    macronutrients: {
      carbs: { amount: values.carbohydrates, unit: 'g' },
      fat: { amount: values.fat, unit: 'g' },
      protein: { amount: values.protein, unit: 'g' },
    },
    micronutrients,
    price: latest
      ? {
          amount: latest.amount,
          currency: latest.currency,
          retailer: latest.retailer,
          quantity: latest.quantity,
        }
      : {
          amount: values.price,
          currency: values.currency,
          retailer: values.retailer,
          quantity: enteredQuantity,
        },
    prices,
  }
}

/**
 * "Food added {date}[, from {source}]" — the full-sentence provenance hint
 * shown on a food/recipe's own Edit page (a compact date-only column covers
 * the same info in the My Foods/My Recipes table). Null when `createdAt` is
 * missing (any food/recipe saved before this field existed — not backfilled).
 */
export function describeAddedFrom(
  createdAt: number | undefined,
  addedFrom: AddedFromInfo | undefined,
  dateFormat: DateFormat,
  itemLabel: 'Food' | 'Recipe' = 'Food',
): string | null {
  if (!createdAt) return null
  const date = formatShortDateFromTimestamp(createdAt, dateFormat)
  if (!addedFrom) return `${itemLabel} added ${date}`
  const source = addedFrom.type === 'connection' ? addedFrom.peerName : addedFrom.source
  return `${itemLabel} added ${date} from ${source}`
}

/** "Sushi Rice [Sunrice]" when the food has a brand on record, otherwise just the name — the display convention for any food pulled live from the `foods/` collection. */
export function foodDisplayName(food: Pick<FoodDocument, 'name' | 'brand'>): string {
  return food.brand ? `${food.name} [${food.brand}]` : food.name
}

/**
 * A case-insensitive, trimmed identity key for a name+brand pair — the
 * basis for `findDuplicateFood`'s "no two foods share a name and brand"
 * rule, and reused by group-inventory consumption matching
 * (`lib/inventoryReconcile.ts`) to recognize "the same product" across
 * different members' independently-created food records, which never
 * share a `foodId`. Two blank brands count as equal, same as
 * `foodDisplayName` treats them (both just show the bare name).
 */
export function normalizedFoodKey(name: string, brand?: string): string {
  return `${name.trim().toLowerCase()}|${(brand ?? '').trim().toLowerCase()}`
}

/**
 * Finds an existing food whose name+brand match `name`/`brand` as currently
 * typed, per `normalizedFoodKey`. `excludeId` leaves a food being edited out
 * of its own check, so saving it unchanged never flags itself as a
 * duplicate of itself.
 */
export function findDuplicateFood<T extends Pick<FoodDocument, 'name' | 'brand'> & { id: string }>(
  foods: T[],
  name: string,
  brand: string,
  excludeId?: string,
): T | null {
  if (!name.trim()) return null
  const key = normalizedFoodKey(name, brand)

  return (
    foods.find((food) => food.id !== excludeId && normalizedFoodKey(food.name, food.brand) === key) ??
    null
  )
}

/**
 * Picks the currency with the highest total price across a set of foods
 * (summing every food's price within each currency), so new foods default
 * to whichever currency already dominates the user's data. Returns null if
 * no food has a priced, currencied entry.
 */
export function dominantCurrency(foods: FoodDocument[]): string | null {
  const totals = new Map<string, number>()

  for (const food of foods) {
    const currency = food.price.currency
    if (!currency) continue

    const amount = Number(food.price.amount)
    if (Number.isNaN(amount)) continue

    totals.set(currency, (totals.get(currency) ?? 0) + amount)
  }

  let best: string | null = null
  let bestTotal = -Infinity
  for (const [currency, total] of totals) {
    if (total > bestTotal) {
      bestTotal = total
      best = currency
    }
  }

  return best
}

export function foodDocumentToFormValues(
  record: FoodDocument,
): FoodFormValues {
  const prices = record.prices ?? []
  const latest = prices.find((p) => p.latest)

  return {
    name: record.name,
    quantity: record.quantity.amount,
    quantityUnit: record.quantity.unit,
    servingSize: record.servingSize ?? '',
    energy: record.energy.amount,
    energyUnit: record.energy.unit,
    carbohydrates: record.macronutrients.carbs.amount,
    fat: record.macronutrients.fat.amount,
    protein: record.macronutrients.protein.amount,
    micronutrients: Object.entries(record.micronutrients ?? {}).map(
      ([name, v]) => ({
        id: crypto.randomUUID(),
        name,
        amount: v.amount,
        unit: v.unit,
      }),
    ),
    // `brand` used to live nested in a price record — read that old spot as
    // a fallback (via an unchecked lookup, since it's deliberately no
    // longer part of either type) so editing a food saved before this
    // field moved doesn't show an empty brand box for no reason. Never
    // written back there; the next save lands it at `record.brand` instead.
    brand:
      record.brand ??
      (latest as { brand?: string } | undefined)?.brand ??
      (record.price as { brand?: string }).brand ??
      '',
    retailer: latest?.retailer ?? record.price.retailer ?? '',
    price: latest?.amount ?? record.price.amount,
    priceQuantity:
      latest?.quantity?.amount ??
      record.price.quantity?.amount ??
      record.quantity.amount,
    priceQuantityUnit:
      latest?.quantity?.unit ??
      record.price.quantity?.unit ??
      record.quantity.unit,
    currency: latest?.currency ?? record.price.currency,
    prices,
  }
}
