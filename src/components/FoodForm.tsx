import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmDeleteModal from './ConfirmDeleteModal.tsx'
import Icon from './Icon.tsx'
import NutritionModal from './NutritionModal.tsx'
import NutritionScanButton from './NutritionScanButton.tsx'
import PageLayout from './PageLayout.tsx'
import PurchaseModal from './PurchaseModal.tsx'
import StatButton from './StatButton.tsx'
import { getCurrencySymbol } from '../data/currencies.ts'
import type { FoodNameEntry } from '../hooks/useFoodNameIndex.ts'
import {
  EMPTY_FOOD_FORM_VALUES,
  findDuplicateFood,
  upsertPriceRecord,
  type FoodFormValues,
} from '../lib/food.ts'
import {
  nutritionScanToFormPatch,
  type ScannedNutritionDetail,
} from '../lib/nutritionScan.ts'
import { fetchPublicFoodByName, publicFoodToFormValues } from '../lib/publicFoodLookup.ts'
import { matchesQuery } from '../lib/search.ts'
import {
  CAL_PER_UNIT,
  formatQuantityLabel,
  quantityConversionFactor,
} from '../lib/units.ts'
import type {
  EnergyUnit,
  FoodDocument,
  Micronutrient,
  MicronutrientUnit,
  PriceRecord,
  QuantityUnit,
} from '../types/food.ts'
import '../pages/pages.css'

function scaleValue(value: string, factor: number): string {
  const num = Number(value)
  if (value.trim() === '' || Number.isNaN(num)) return value
  return String(Math.round(num * factor * 1000) / 1000)
}

type FoodFormProps = {
  title: string
  submitLabel: string
  savingLabel: string
  initialValues?: FoodFormValues
  /** `duplicateId` is set when the typed name+brand match another saved food (see `existingFoods`) — the caller should save into that food's document instead of this form's own target. */
  onSubmit: (values: FoodFormValues, duplicateId: string | null) => Promise<void>
  onDelete?: () => Promise<void>
  resetOnSuccess?: boolean
  foodNameIndex?: FoodNameEntry[]
  /** Resolved in the background (e.g. dominant/IP-geolocated currency); applied only if the user hasn't already changed the currency away from its initial value. */
  defaultCurrency?: string
  /** The user's own saved foods, for the "no two foods share a name and brand" check. */
  existingFoods?: (FoodDocument & { id: string })[]
  /** Excludes this food's own id from the duplicate check when editing — otherwise a food editing itself without changing name/brand would flag itself. Omit when adding a brand-new food. */
  currentFoodId?: string
  /**
   * Set when this food backs an established shared item (see
   * `types/groups.ts`'s `SharedItemDocument`) — the name of the group it's
   * shared with, purely for display. Name/brand become read-only (renaming
   * a shared item would need migrating the group's own records, out of
   * scope — see that type's doc comment) and a hint explains that
   * nutrition/price changes need group approval. The actual propose-vs-save
   * branching happens in the caller's `onSubmit`, which already has this
   * same gating info in scope.
   */
  gatingGroupName?: string | null
  /** "Food added {date}[, from {source}]" (see `lib/food.ts`'s `describeAddedFrom`) — null when there's nothing to show (a food saved before `createdAt` existed, or this is the Add Food form with nothing saved yet). */
  addedFromHint?: string | null
}

function FoodForm({
  title,
  submitLabel,
  savingLabel,
  initialValues,
  onSubmit,
  onDelete,
  resetOnSuccess = true,
  foodNameIndex = [],
  defaultCurrency,
  existingFoods = [],
  currentFoodId,
  gatingGroupName = null,
  addedFromHint = null,
}: FoodFormProps) {
  // Every gated page (Add Food and Edit Food both use this component) is
  // permanently mounted at once (see PageRegistry.tsx), so a plain static
  // id like "food-name" would collide between this form's own two
  // simultaneously-mounted instances — useId() gives each instance a
  // unique prefix instead.
  const formId = useId()
  const start = initialValues ?? EMPTY_FOOD_FORM_VALUES
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [name, setName] = useState(start.name)
  const [nameSearchOpen, setNameSearchOpen] = useState(false)
  const [quantity, setQuantity] = useState(start.quantity)
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>(
    start.quantityUnit,
  )
  const [servingSize, setServingSize] = useState(start.servingSize)

  const [nutritionOpen, setNutritionOpen] = useState(false)
  const [energy, setEnergy] = useState(start.energy)
  const [energyUnit, setEnergyUnit] = useState<EnergyUnit>(start.energyUnit)
  const [carbohydrates, setCarbohydrates] = useState(start.carbohydrates)
  const [fat, setFat] = useState(start.fat)
  const [protein, setProtein] = useState(start.protein)
  const [micronutrients, setMicronutrients] = useState<Micronutrient[]>(
    start.micronutrients,
  )

  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [brand, setBrand] = useState(start.brand)
  const [retailer, setRetailer] = useState(start.retailer)
  const [price, setPrice] = useState(start.price)
  // Defaults to the nutrition quantity (below) until the user picks a
  // different quantity for this price, or selects a saved price record that
  // has its own — null means "still following the nutrition quantity".
  const [priceQuantityOverride, setPriceQuantityOverride] = useState<{
    amount: string
    unit: QuantityUnit
  } | null>(() =>
    start.priceQuantity
      ? { amount: start.priceQuantity, unit: start.priceQuantityUnit }
      : null,
  )
  const [currency, setCurrency] = useState(start.currency)
  const [prices, setPrices] = useState<PriceRecord[]>(start.prices)

  useEffect(() => {
    if (defaultCurrency && currency === start.currency) {
      setCurrency(defaultCurrency)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCurrency])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingPublicFoodName, setLoadingPublicFoodName] = useState<
    string | null
  >(null)

  function addMicronutrient() {
    setMicronutrients((rows) => [
      ...rows,
      { id: crypto.randomUUID(), name: '', amount: '', unit: 'mg' },
    ])
  }

  function updateMicronutrient(
    id: string,
    field: 'name' | 'amount',
    value: string,
  ) {
    setMicronutrients((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    )
  }

  function updateMicronutrientUnit(id: string, unit: MicronutrientUnit) {
    setMicronutrients((rows) =>
      rows.map((row) => (row.id === id ? { ...row, unit } : row)),
    )
  }

  function removeMicronutrient(id: string) {
    setMicronutrients((rows) => rows.filter((row) => row.id !== id))
  }

  const duplicateFood = findDuplicateFood(existingFoods, name, brand, currentFoodId)

  const trimmedName = name.trim()
  const publicFoodResults = trimmedName
    ? foodNameIndex.filter((entry) => matchesQuery(entry.name, trimmedName))
    : []

  async function handleLoadPublicFood(entry: FoodNameEntry) {
    setError('')
    setLoadingPublicFoodName(entry.name)
    try {
      const food = await fetchPublicFoodByName(entry.name)
      if (!food) {
        setError(`Could not find nutrition data for "${entry.name}".`)
        return
      }
      const values = publicFoodToFormValues(food)
      setName(values.name)
      setQuantity(values.quantity)
      setQuantityUnit(values.quantityUnit)
      setEnergy(values.energy)
      setEnergyUnit(values.energyUnit)
      setCarbohydrates(values.carbohydrates)
      setFat(values.fat)
      setProtein(values.protein)
      setMicronutrients(values.micronutrients)
    } catch {
      setError('Could not load nutrition data. Please try again.')
    } finally {
      setLoadingPublicFoodName(null)
      setNameSearchOpen(false)
    }
  }

  function handleNutritionScan(details: ScannedNutritionDetail[]) {
    const patch = nutritionScanToFormPatch(details, {
      quantity,
      quantityUnit,
      servingSize,
      energy,
      energyUnit,
      carbohydrates,
      fat,
      protein,
      micronutrients,
    })
    setQuantity(patch.quantity)
    setQuantityUnit(patch.quantityUnit)
    setServingSize(patch.servingSize)
    setEnergy(patch.energy)
    setEnergyUnit(patch.energyUnit)
    setCarbohydrates(patch.carbohydrates)
    setFat(patch.fat)
    setProtein(patch.protein)
    setMicronutrients(patch.micronutrients)
  }

  // The effective price quantity: whatever the user (or a selected price
  // record) explicitly set, or the nutrition quantity by default.
  const priceQuantity = priceQuantityOverride?.amount ?? quantity
  const priceQuantityUnit = priceQuantityOverride?.unit ?? quantityUnit

  function handleSelectPriceRecord(record: PriceRecord) {
    // Brand is now a food-wide attribute, not per-retailer — switching
    // which saved price record is active leaves it untouched.
    setRetailer(record.retailer)
    setPrice(record.amount)
    setCurrency(record.currency)
    setPriceQuantityOverride(
      record.quantity
        ? { amount: record.quantity.amount, unit: record.quantity.unit }
        : null,
    )
  }

  function handleQuantityUnitChange(newUnit: QuantityUnit) {
    const factor = quantityConversionFactor(quantityUnit, newUnit)
    setQuantity((v) => scaleValue(v, factor))
    setQuantityUnit(newUnit)
  }

  function handlePriceQuantityChange(value: string) {
    setPriceQuantityOverride({ amount: value, unit: priceQuantityUnit })
  }

  function handlePriceQuantityUnitChange(newUnit: QuantityUnit) {
    const factor = quantityConversionFactor(priceQuantityUnit, newUnit)
    setPriceQuantityOverride({
      amount: scaleValue(priceQuantity, factor),
      unit: newUnit,
    })
  }

  function handleEnergyUnitChange(newUnit: EnergyUnit) {
    const factor = CAL_PER_UNIT[energyUnit] / CAL_PER_UNIT[newUnit]
    setEnergy((v) => scaleValue(v, factor))
    setEnergyUnit(newUnit)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit(
        {
          name,
          quantity,
          quantityUnit,
          servingSize,
          energy,
          energyUnit,
          carbohydrates,
          fat,
          protein,
          micronutrients,
          brand,
          retailer,
          price,
          priceQuantity,
          priceQuantityUnit,
          currency,
          prices,
        },
        duplicateFood?.id ?? null,
      )

      if (resetOnSuccess) {
        setName('')
        setQuantity('')
        setQuantityUnit('g')
        setServingSize('')
        setEnergy('')
        setEnergyUnit('cal')
        setCarbohydrates('')
        setFat('')
        setProtein('')
        setMicronutrients([])
        setBrand('')
        setRetailer('')
        setPrice('')
        setPriceQuantityOverride(null)
        setCurrency(defaultCurrency ?? start.currency)
        setPrices([])
      } else if (retailer.trim()) {
        setPrices((current) =>
          upsertPriceRecord(current, {
            retailer: retailer.trim(),
            amount: price,
            currency,
            latest: true,
            quantity: { amount: priceQuantity, unit: priceQuantityUnit },
          }),
        )
      }
    } catch {
      setError('Could not save this food. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageLayout
        header={
          <>
            <Link to="/foods" className="top-link">
              <Icon name="leaf" size={13} />
              Foods
            </Link>
            <div className="title-row">
              <h1>{title}</h1>
              {onDelete && (
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  onClick={() => setDeleteOpen(true)}
                  aria-label="Delete food"
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          </>
        }
      >
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor={`${formId}-food-name`}>Name</label>
          <div className="food-autocomplete">
            <input
              id={`${formId}-food-name`}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameSearchOpen(true)
              }}
              onFocus={() => setNameSearchOpen(true)}
              onBlur={() => setNameSearchOpen(false)}
              autoComplete="off"
              required
              disabled={!!gatingGroupName}
            />

            {nameSearchOpen && publicFoodResults.length > 0 && (
              <div className="food-autocomplete-menu">
                <ul className="food-search-results">
                  {publicFoodResults.map((food) => (
                    <li key={`${food.name}-${food.source}`}>
                      <button
                        type="button"
                        className="food-search-result-public"
                        disabled={loadingPublicFoodName === food.name}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleLoadPublicFood(food)}
                      >
                        <span>{food.name}</span>
                        <span className="food-search-result-source">
                          {loadingPublicFoodName === food.name
                            ? 'Loading...'
                            : `Load data from ${food.source}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <label htmlFor={`${formId}-food-brand`}>Brand</label>
          <input
            id={`${formId}-food-brand`}
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            disabled={!!gatingGroupName}
          />
          {duplicateFood && (
            <p className="form-hint">
              Food already found — changes will update the existing entry.
            </p>
          )}
          {gatingGroupName && (
            <p className="form-hint">
              This food is part of {gatingGroupName}'s shared inventory —
              name and brand can't be changed while it's shared this way.
              Changes to nutrition or price need approval from every other
              member before they take effect.
            </p>
          )}
          {addedFromHint && <p className="form-hint">{addedFromHint}</p>}

          <NutritionScanButton onScanned={handleNutritionScan} />

          <label htmlFor={`${formId}-serving-size`}>Serving Size</label>
          <input
            id={`${formId}-serving-size`}
            type="text"
            placeholder="e.g. 140g (1 fruit)"
            value={servingSize}
            onChange={(e) => setServingSize(e.target.value)}
          />

          <StatButton
            label="Nutrition"
            icon="leaf"
            value={energy.trim() ? `${energy} ${energyUnit}` : undefined}
            onClick={() => setNutritionOpen(true)}
          />

          <StatButton
            label="Price"
            icon="tag"
            value={
              price.trim()
                ? `${getCurrencySymbol(currency)}${Number(price).toFixed(2)}/${formatQuantityLabel(priceQuantity, priceQuantityUnit, servingSize)}`
                : undefined
            }
            onClick={() => setPurchaseOpen(true)}
          />

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? savingLabel : submitLabel}
          </button>
        </form>
      </PageLayout>

      <NutritionModal
        open={nutritionOpen}
        onClose={() => setNutritionOpen(false)}
        quantity={quantity}
        onQuantityChange={setQuantity}
        quantityUnit={quantityUnit}
        onQuantityUnitChange={handleQuantityUnitChange}
        energy={energy}
        onEnergyChange={setEnergy}
        energyUnit={energyUnit}
        onEnergyUnitChange={handleEnergyUnitChange}
        carbohydrates={carbohydrates}
        onCarbohydratesChange={setCarbohydrates}
        fat={fat}
        onFatChange={setFat}
        protein={protein}
        onProteinChange={setProtein}
        micronutrients={micronutrients}
        onAddMicronutrient={addMicronutrient}
        onMicronutrientChange={updateMicronutrient}
        onMicronutrientUnitChange={updateMicronutrientUnit}
        onRemoveMicronutrient={removeMicronutrient}
      />

      <PurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        retailer={retailer}
        onRetailerChange={setRetailer}
        price={price}
        onPriceChange={setPrice}
        quantity={priceQuantity}
        onQuantityChange={handlePriceQuantityChange}
        quantityUnit={priceQuantityUnit}
        onQuantityUnitChange={handlePriceQuantityUnitChange}
        nutritionQuantity={quantity}
        nutritionQuantityUnit={quantityUnit}
        servingSize={servingSize}
        currency={currency}
        onCurrencyChange={setCurrency}
        prices={prices}
        onSelectPriceRecord={handleSelectPriceRecord}
      />

      {onDelete && (
        <ConfirmDeleteModal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={onDelete}
          title="Delete Food?"
          message={`This will permanently delete "${name || 'this food'}". This can't be undone.`}
        />
      )}
    </>
  )
}

export default FoodForm
