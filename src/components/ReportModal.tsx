import { useState } from 'react'
import EnergyToggle from './EnergyToggle.tsx'
import Modal from './Modal.tsx'
import ShoppingListModal from './ShoppingListModal.tsx'
import NutritionReportModal from './NutritionReportModal.tsx'
import CurrencyMismatchModal from './CurrencyMismatchModal.tsx'
import Icon from './Icon.tsx'
import { getCurrencySymbol } from '../data/currencies.ts'
import { bestEnergyTotal, convertEnergy, otherEnergyUnit } from '../lib/units.ts'
import {
  autoResolveShoppingList,
  findBestAutoTarget,
  hasCurrencyMismatch,
  type ExchangeRateRecord,
} from '../lib/currencyResolution.ts'
import type { ReportData, ShoppingListEntry } from '../lib/report.ts'
import type { EnergyUnit, MealListItem } from '../types/food.ts'

type ReportModalProps = {
  open: boolean
  onClose: () => void
  title: string
  report: ReportData | null
  meals: MealListItem[]
  range: [string, string]
  exchangeRates: ExchangeRateRecord[]
}

function ReportModal({
  open,
  onClose,
  title,
  report,
  meals,
  range,
  exchangeRates,
}: ReportModalProps) {
  const [shoppingOpen, setShoppingOpen] = useState(false)
  const [nutritionOpen, setNutritionOpen] = useState(false)
  const [mismatchOpen, setMismatchOpen] = useState(false)
  const [shoppingEntries, setShoppingEntries] = useState<ShoppingListEntry[]>([])
  const [mismatchEntries, setMismatchEntries] = useState<ShoppingListEntry[]>([])
  const [energyDisplayUnit, setEnergyDisplayUnit] = useState<EnergyUnit | null>(
    null,
  )

  if (!report) return null

  const energy = bestEnergyTotal(report.avgCaloriesPerDay, report.energyUnitsInUse)
  const displayUnit = energyDisplayUnit ?? energy.unit
  const displayAmount = convertEnergy(energy.amount, energy.unit, displayUnit)

  function openShoppingList() {
    const list = report!.shoppingList
    if (!hasCurrencyMismatch(list)) {
      setShoppingEntries(list)
      setShoppingOpen(true)
      return
    }

    const autoTarget = findBestAutoTarget(list, exchangeRates)
    const autoResolved = autoTarget
      ? autoResolveShoppingList(list, autoTarget, exchangeRates)
      : list

    if (!hasCurrencyMismatch(autoResolved)) {
      setShoppingEntries(autoResolved)
      setShoppingOpen(true)
      return
    }

    setMismatchEntries(autoResolved)
    setMismatchOpen(true)
  }

  function handleResolved(resolved: ShoppingListEntry[]) {
    setMismatchOpen(false)
    setShoppingEntries(resolved)
    setShoppingOpen(true)
  }

  return (
    <Modal open={open} onClose={onClose} titleId="report-title" title={title}>
      <div className="report-stats">
        <div className="report-stat">
          <span className="report-stat-label">Avg. Calories / Day</span>
          <EnergyToggle
            className="report-stat-value"
            amount={displayAmount}
            unit={displayUnit}
            onToggle={() => setEnergyDisplayUnit(otherEnergyUnit(displayUnit))}
          />
        </div>
        <div className="report-stat">
          <span className="report-stat-label">Avg. Cost / Day</span>
          <span className="report-stat-value">
            {report.costCurrency ? getCurrencySymbol(report.costCurrency) : ''}
            {report.avgCostPerDay.toFixed(2)}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={openShoppingList}
      >
        <Icon name="cart" size={16} />
        Shopping List
      </button>

      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={() => setNutritionOpen(true)}
      >
        <Icon name="leaf" size={16} />
        Nutrition
      </button>

      <CurrencyMismatchModal
        open={mismatchOpen}
        onClose={() => setMismatchOpen(false)}
        entries={mismatchEntries}
        meals={meals}
        weekStart={range[0]}
        weekEnd={range[1]}
        onResolved={handleResolved}
      />

      <ShoppingListModal
        open={shoppingOpen}
        onClose={() => setShoppingOpen(false)}
        entries={shoppingEntries}
      />

      <NutritionReportModal
        open={nutritionOpen}
        onClose={() => setNutritionOpen(false)}
        report={report}
      />
    </Modal>
  )
}

export default ReportModal
