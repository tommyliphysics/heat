import { useState } from 'react'
import CurrencyMismatchModal from './CurrencyMismatchModal.tsx'
import EnergyToggle from './EnergyToggle.tsx'
import ShoppingListTable from './ShoppingListTable.tsx'
import NutritionStats from './NutritionStats.tsx'
import Icon from './Icon.tsx'
import { getCurrencySymbol } from '../data/currencies.ts'
import { computeReport, type ShoppingListEntry } from '../lib/report.ts'
import { formatMinutes } from '../lib/time.ts'
import { fromCalories, otherEnergyUnit } from '../lib/units.ts'
import {
  autoResolveShoppingList,
  findBestAutoTarget,
  hasCurrencyMismatch,
  type ExchangeRateRecord,
} from '../lib/currencyResolution.ts'
import type { EnergyUnit, MealListItem } from '../types/food.ts'

type PeriodReportSectionProps = {
  variant: 'day' | 'week'
  meals: MealListItem[]
  days: number
  range: [string, string]
  exchangeRates: ExchangeRateRecord[]
}

function PeriodReportSection({
  variant,
  meals,
  days,
  range,
  exchangeRates,
}: PeriodReportSectionProps) {
  const report = computeReport(meals, days)

  const [entries, setEntries] = useState<ShoppingListEntry[]>(() => {
    const target = findBestAutoTarget(report.shoppingList, exchangeRates)
    return target
      ? autoResolveShoppingList(report.shoppingList, target, exchangeRates)
      : report.shoppingList
  })
  const [shoppingOpen, setShoppingOpen] = useState(false)
  const [nutritionOpen, setNutritionOpen] = useState(false)
  const [mismatchOpen, setMismatchOpen] = useState(false)
  const [energyDisplayUnit, setEnergyDisplayUnit] = useState<EnergyUnit | null>(
    null,
  )

  const mismatched = hasCurrencyMismatch(entries)
  const totalSpend = entries.reduce((sum, entry) => sum + entry.totalPrice, 0)
  const spendCurrency = entries[0]?.currency ?? ''
  const energyUnit = energyDisplayUnit ?? report.dominantEnergyUnit
  const energyAmount = fromCalories(report.avgCaloriesPerDay, energyUnit)

  function handleResolved(resolved: ShoppingListEntry[]) {
    setEntries(resolved)
    setMismatchOpen(false)
  }

  return (
    <div className="week-report">
      <div className="report-stats">
        {!mismatched &&
          (variant === 'week' ? (
            <>
              <div className="report-stat">
                <span className="report-stat-label">Total spend</span>
                <span className="report-stat-value">
                  {getCurrencySymbol(spendCurrency)}
                  {totalSpend.toFixed(2)}
                </span>
              </div>
              <div className="report-stat">
                <span className="report-stat-label">Avg. spend/day</span>
                <span className="report-stat-value">
                  {getCurrencySymbol(spendCurrency)}
                  {(totalSpend / (days || 1)).toFixed(2)}
                </span>
              </div>
            </>
          ) : (
            <div className="report-stat">
              <span className="report-stat-label">Spend</span>
              <span className="report-stat-value">
                {getCurrencySymbol(spendCurrency)}
                {totalSpend.toFixed(2)}
              </span>
            </div>
          ))}
        <div className="report-stat">
          <span className="report-stat-label">
            {variant === 'week' ? `Avg. ${energyUnit}/Day` : 'Energy'}
          </span>
          <EnergyToggle
            className="report-stat-value"
            amount={energyAmount}
            unit={energyUnit}
            onToggle={() => setEnergyDisplayUnit(otherEnergyUnit(energyUnit))}
          />
        </div>
        <div className="report-stat">
          <span className="report-stat-label hands-on-label">
            <Icon name="clock" size={13} />
            Total Hands-on
          </span>
          <span className="report-stat-value">
            {formatMinutes(report.totalHandsOnMinutes)}
          </span>
        </div>
      </div>

      {!mismatched && (
        <>
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={() => setShoppingOpen((v) => !v)}
          >
            <Icon name="cart" size={16} />
            Shopping List
          </button>
          {shoppingOpen && <ShoppingListTable entries={entries} />}
        </>
      )}

      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={() => setNutritionOpen((v) => !v)}
      >
        <Icon name="leaf" size={16} />
        Nutrition
      </button>
      {nutritionOpen && (
        <>
          {variant === 'week' && (
            <p className="nutrition-caption">Daily Average</p>
          )}
          <NutritionStats report={report} />
        </>
      )}

      {mismatched && (
        <button
          type="button"
          className="link-danger"
          onClick={() => setMismatchOpen(true)}
        >
          <Icon name="warning" size={15} />
          Multiple currencies found - fix to see spending
        </button>
      )}

      <CurrencyMismatchModal
        open={mismatchOpen}
        onClose={() => setMismatchOpen(false)}
        entries={entries}
        meals={meals}
        weekStart={range[0]}
        weekEnd={range[1]}
        onResolved={handleResolved}
      />
    </div>
  )
}

export default PeriodReportSection
