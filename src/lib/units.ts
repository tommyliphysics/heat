import type {
  EnergyUnit,
  FoodDocument,
  MicronutrientUnit,
  QuantityUnit,
} from '../types/food.ts'

/** The bits of a food (or a food-in-progress, not yet assembled into a full FoodDocument) needed to reason about its 'serving' unit. */
type QuantityContext = {
  quantity: { amount: string; unit: QuantityUnit }
  servingSize?: string
}

export const GRAMS_PER_UNIT: Record<'g' | 'kg' | 'lb' | 'oz', number> = {
  g: 1,
  kg: 1000,
  lb: 453.592,
  oz: 28.3495,
}

export const ML_PER_UNIT: Record<'mL' | 'L' | 'qt' | 'fl oz', number> = {
  mL: 1,
  L: 1000,
  qt: 946.353,
  'fl oz': 29.5735,
}

export const CAL_PER_UNIT: Record<EnergyUnit, number> = {
  cal: 1,
  kJ: 1 / 4.184,
}

export const MG_PER_MICRO_UNIT: Record<MicronutrientUnit, number> = {
  mg: 1,
  g: 1000,
  ug: 0.001,
}

export function toCalories(amount: string, unit: EnergyUnit): number {
  const num = Number(amount)
  if (Number.isNaN(num)) return 0
  return num * CAL_PER_UNIT[unit]
}

export function fromCalories(calories: number, unit: EnergyUnit): number {
  return calories / CAL_PER_UNIT[unit]
}

/**
 * Given a total energy in calories and the set of energy units actually used
 * by the foods it was built from, picks whichever of those units yields the
 * largest total (comparing them requires expressing them all in calories
 * first) and returns the total expressed in that unit.
 */
export function bestEnergyTotal(
  totalCalories: number,
  unitsInUse: EnergyUnit[],
): { amount: number; unit: EnergyUnit } {
  if (unitsInUse.length === 0) return { amount: totalCalories, unit: 'cal' }

  let bestUnit = unitsInUse[0]
  let bestAmount = fromCalories(totalCalories, bestUnit)

  for (const unit of unitsInUse.slice(1)) {
    const amount = fromCalories(totalCalories, unit)
    if (amount > bestAmount) {
      bestAmount = amount
      bestUnit = unit
    }
  }

  return { amount: bestAmount, unit: bestUnit }
}

/** Re-expresses an energy amount in a different unit, e.g. for a click-to-toggle cal/kJ display. */
export function convertEnergy(
  amount: number,
  fromUnit: EnergyUnit,
  toUnit: EnergyUnit,
): number {
  return fromCalories(amount * CAL_PER_UNIT[fromUnit], toUnit)
}

/** The other energy unit — cal <-> kJ — for toggling a display between them. */
export function otherEnergyUnit(unit: EnergyUnit): EnergyUnit {
  return unit === 'cal' ? 'kJ' : 'cal'
}

export function toGrams(amount: string, unit: QuantityUnit): number {
  const num = Number(amount)
  if (Number.isNaN(num) || !(unit in GRAMS_PER_UNIT)) return 0
  return num * GRAMS_PER_UNIT[unit as keyof typeof GRAMS_PER_UNIT]
}

export function toMilliliters(amount: string, unit: QuantityUnit): number {
  const num = Number(amount)
  if (Number.isNaN(num) || !(unit in ML_PER_UNIT)) return 0
  return num * ML_PER_UNIT[unit as keyof typeof ML_PER_UNIT]
}

/**
 * Factor to multiply a quantity by when relabeling it from `fromUnit` to
 * `toUnit`. Only defined within a single measurement kind (weight or
 * volume) — crossing kinds (or involving the unitless "whole item" unit)
 * has no valid conversion, so the amount is left as-is.
 */
export function quantityConversionFactor(
  fromUnit: QuantityUnit,
  toUnit: QuantityUnit,
): number {
  if (fromUnit in GRAMS_PER_UNIT && toUnit in GRAMS_PER_UNIT) {
    return (
      GRAMS_PER_UNIT[fromUnit as keyof typeof GRAMS_PER_UNIT] /
      GRAMS_PER_UNIT[toUnit as keyof typeof GRAMS_PER_UNIT]
    )
  }
  if (fromUnit in ML_PER_UNIT && toUnit in ML_PER_UNIT) {
    return (
      ML_PER_UNIT[fromUnit as keyof typeof ML_PER_UNIT] /
      ML_PER_UNIT[toUnit as keyof typeof ML_PER_UNIT]
    )
  }
  return 1
}

/**
 * How many times more (or less) food `amount unit` represents than
 * `baseAmount baseUnit` — e.g. a food stored per 100g used at 250g gives
 * 2.5, so its nutrition can be scaled to match. Converts through grams or
 * milliliters when the two use the same measurement kind (weight or
 * volume) but different units; for count-like units (whole items,
 * servings) or a kind mismatch, compares the raw numbers directly since
 * there's no unit conversion to fall back on.
 */
export function quantityRatio(
  baseAmount: string,
  baseUnit: QuantityUnit,
  amount: string,
  unit: QuantityUnit,
): number {
  const num = Number(amount)
  if (Number.isNaN(num)) return 0

  if (baseUnit in GRAMS_PER_UNIT && unit in GRAMS_PER_UNIT) {
    const baseGrams = toGrams(baseAmount, baseUnit)
    return baseGrams ? toGrams(amount, unit) / baseGrams : 0
  }
  if (baseUnit in ML_PER_UNIT && unit in ML_PER_UNIT) {
    const baseMl = toMilliliters(baseAmount, baseUnit)
    return baseMl ? toMilliliters(amount, unit) / baseMl : 0
  }

  const baseNum = Number(baseAmount)
  return baseNum ? num / baseNum : 0
}

const QUANTITY_UNIT_ALIASES: Record<string, QuantityUnit> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  ml: 'mL',
  milliliter: 'mL',
  milliliters: 'mL',
  millilitre: 'mL',
  millilitres: 'mL',
  l: 'L',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
  qt: 'qt',
  quart: 'qt',
  quarts: 'qt',
  'fl oz': 'fl oz',
  'fl.oz': 'fl oz',
  floz: 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
}

/** Maps a free-text unit token (as typed by a user or reported by the label scanner) onto the form's QuantityUnit enum; null when there's no sane mapping (e.g. "cup", "slice"). */
export function normalizeQuantityUnit(unit: string): QuantityUnit | null {
  const key = unit.trim().toLowerCase().replace(/\.(?=\s|$)/g, '')
  return QUANTITY_UNIT_ALIASES[key] ?? null
}

const SERVING_SIZE_PATTERN = /^\s*([\d.]+)\s*([a-zA-Zµ.]+)/

/** Extracts the leading amount+unit from a free-text serving-size label, e.g. "140g (1 fruit)" -> { amount: "140", unit: "g" }. Null when the label doesn't start with a recognizable amount/unit. */
export function parseServingSize(
  servingSize: string | undefined,
): { amount: string; unit: QuantityUnit } | null {
  if (!servingSize) return null
  const match = servingSize.match(SERVING_SIZE_PATTERN)
  if (!match) return null
  const unit = normalizeQuantityUnit(match[2])
  if (!unit) return null
  return { amount: match[1], unit }
}

/**
 * How many times bigger one serving of `food` is than its recorded base
 * quantity (e.g. base 100g, servingSize "140g (1 fruit)" -> 1.4). Null when
 * the serving size can't be parsed, or parses to a different measurement
 * kind than the base quantity (e.g. base recorded in 'ea' but serving size
 * given in grams) — there's no way to relate those without more info.
 */
export function foodServingRatio(food: QuantityContext): number | null {
  const serving = parseServingSize(food.servingSize)
  if (!serving) return null

  const baseUnit = food.quantity.unit
  const sameKind =
    (baseUnit in GRAMS_PER_UNIT && serving.unit in GRAMS_PER_UNIT) ||
    (baseUnit in ML_PER_UNIT && serving.unit in ML_PER_UNIT) ||
    baseUnit === serving.unit
  if (!sameKind) return null

  return quantityRatio(food.quantity.amount, baseUnit, serving.amount, serving.unit)
}

const SERVING_DESCRIPTOR_PATTERN = /\(([^)]+)\)/

/**
 * The label to show for a food's 'serving' unit option — the parenthesized,
 * everyday descriptor from its serving size (e.g. "250mL (1 cup)" -> "1 cup",
 * "140g (1 fruit)" -> "1 fruit"), since that's more meaningful to a user
 * picking a quantity than the generic word "serving". Falls back to
 * "serving" when the serving size has no such descriptor.
 */
export function foodServingLabel(servingSize: string | undefined): string {
  const match = servingSize?.match(SERVING_DESCRIPTOR_PATTERN)
  return match ? match[1].trim() : 'serving'
}

/**
 * Formats a quantity for display, e.g. "250mL" (dropping a redundant "1",
 * e.g. just "mL") or, for the 'serving' unit, the food's serving-size
 * descriptor ("1 cup") — multiplied out ("2 × 1 cup") when the amount isn't
 * 1, since the descriptor already reads as one whole serving and can't just
 * be concatenated with a leading number like the other units can.
 */
export function formatQuantityLabel(
  amount: string,
  unit: QuantityUnit,
  servingSize?: string,
): string {
  const isOne = !amount || Number(amount) === 1

  if (unit === 'serving') {
    const label = foodServingLabel(servingSize)
    return isOne ? label : `${amount} × ${label}`
  }
  return `${isOne ? '' : amount}${formatUnitLabel(unit)}`
}

/**
 * The quantity units a user can pick when entering an amount of `food` into
 * a meal or recipe — only units convertible to how the food's own reference
 * quantity is recorded (weight units for a weight-based food, volume units
 * for a volume-based food, or just its own unit for anything else), plus
 * 'serving' when the food's serving size can be related back to that base
 * quantity (see `foodServingRatio`).
 */
export function compatibleQuantityUnits(food: QuantityContext): QuantityUnit[] {
  const baseUnit = food.quantity.unit
  let units: QuantityUnit[]
  if (baseUnit in GRAMS_PER_UNIT) units = ['g', 'kg', 'oz', 'lb']
  else if (baseUnit in ML_PER_UNIT) units = ['mL', 'L', 'fl oz', 'qt']
  else units = [baseUnit]

  return foodServingRatio(food) !== null ? [...units, 'serving'] : units
}

/** Every weight/volume/whole-item unit, for a quantity with no reference food to constrain it to (e.g. a non-food "Other" inventory item) — excludes 'serving', which is only meaningful relative to a specific food's serving size. */
export const ALL_QUANTITY_UNITS: QuantityUnit[] = [
  '',
  'g',
  'kg',
  'oz',
  'lb',
  'mL',
  'L',
  'fl oz',
  'qt',
]

/**
 * How many times bigger `amount unit` is than `food`'s recorded base
 * quantity — like `quantityRatio`, but also understands unit `'serving'`
 * (interpreting `amount` as a number of servings and scaling by
 * `foodServingRatio`) since that's not a fixed conversion `quantityRatio`
 * alone can express.
 */
export function foodQuantityRatio(
  food: QuantityContext,
  amount: string,
  unit: QuantityUnit,
): number {
  if (unit === 'serving') {
    const perServing = foodServingRatio(food)
    const servings = Number(amount)
    if (perServing === null || Number.isNaN(servings)) return 0
    return perServing * servings
  }
  return quantityRatio(food.quantity.amount, food.quantity.unit, amount, unit)
}

/**
 * How many times bigger `amount unit` is than the quantity `food`'s price
 * actually buys — i.e. `food.price.quantity`, falling back to the nutrition
 * `quantity` for records saved before per-price quantities existed. Use
 * this (never `foodQuantityRatio`) to scale a food's price/cost, since the
 * price can be quoted for a different amount than nutrition is recorded per
 * (e.g. nutrition per 100g, price for a 1kg pack).
 */
export function foodPriceRatio(
  food: FoodDocument,
  amount: string,
  unit: QuantityUnit,
): number {
  const priceQuantity = food.price.quantity ?? food.quantity

  if (priceQuantity.unit !== 'serving') {
    return foodQuantityRatio(
      { quantity: priceQuantity, servingSize: food.servingSize },
      amount,
      unit,
    )
  }

  // The price's own base is itself "1 serving" — resolve that down to a
  // concrete weight/volume amount first, so it can relate to any target
  // unit (including 'serving' again) rather than just itself.
  const serving = parseServingSize(food.servingSize)
  if (!serving) return 0
  const servings = Number(priceQuantity.amount) || 0
  const resolved = {
    amount: String(Number(serving.amount) * servings),
    unit: serving.unit,
  }
  return foodQuantityRatio(
    { quantity: resolved, servingSize: food.servingSize },
    amount,
    unit,
  )
}

export function toMilligrams(amount: string, unit: MicronutrientUnit): number {
  const num = Number(amount)
  if (Number.isNaN(num)) return 0
  return num * MG_PER_MICRO_UNIT[unit]
}

/** Display label for a quantity unit (the "ea" whole-item unit is stored as ''; "fl oz" displays with its usual period as "fl. oz"). */
export function formatUnitLabel(unit: QuantityUnit): string {
  if (unit === '') return 'ea'
  if (unit === 'fl oz') return 'fl. oz'
  return unit
}

export function formatGrams(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`
  return `${Math.round(grams)} g`
}

export function formatMilliliters(mL: number): string {
  if (mL >= 1000) return `${(mL / 1000).toFixed(2)} L`
  return `${Math.round(mL)} mL`
}

export function formatQuantity(entry: {
  totalGrams: number
  totalMilliliters: number
  totalCount: number
}): string {
  if (entry.totalCount > 0) {
    return String(Math.round(entry.totalCount * 100) / 100)
  }
  if (entry.totalMilliliters > 0) {
    return formatMilliliters(entry.totalMilliliters)
  }
  return formatGrams(entry.totalGrams)
}

export function formatMilligrams(mg: number): string {
  if (mg >= 1000) return `${(mg / 1000).toFixed(2)} g`
  return `${Math.round(mg)} mg`
}
