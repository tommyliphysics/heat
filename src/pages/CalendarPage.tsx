import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import EnergyToggle from '../components/EnergyToggle.tsx'
import MealPrepTimelineModal from '../components/MealPrepTimelineModal.tsx'
import Modal from '../components/Modal.tsx'
import PageLayout from '../components/PageLayout.tsx'
import ReportModal from '../components/ReportModal.tsx'
import PeriodReportSection from '../components/PeriodReportSection.tsx'
import RecipeMealEditModal from '../components/RecipeMealEditModal.tsx'
import Icon from '../components/Icon.tsx'
import { getCurrencySymbol } from '../data/currencies.ts'
import type { AddFoodNavResult } from '../lib/addFoodNav.ts'
import type { FoodRow } from '../lib/foodRow.ts'
import { useDoses } from '../hooks/useDoses.ts'
import { useAllGroupInventoryBatches } from '../hooks/useAllGroupInventoryBatches.ts'
import { useInventoryBatches } from '../hooks/useInventoryBatches.ts'
import { useTodayDoseLogs } from '../hooks/useTodayDoseLogs.ts'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import { aggregateDoseStatus, computeDoseStatus } from '../lib/doseStatus.ts'
import { applyInventoryPricing } from '../lib/inventory.ts'
import { computeReport, mealHandsOnMinutes, type ReportData } from '../lib/report.ts'
import { formatMinutes } from '../lib/time.ts'
import { fromCalories, otherEnergyUnit } from '../lib/units.ts'
import type { ExchangeRateRecord } from '../lib/currencyResolution.ts'
import {
  addDays,
  buildDateRange,
  capitalize,
  formatDayHeading,
  formatMonthYear,
  formatShortDate,
  formatYear,
  MEAL_TIME_ORDER,
  monthRange,
  parseDateStr,
  toDateStr,
  weekRange,
  yearRange,
} from '../lib/timeline.ts'
import type { EnergyUnit, MealListItem } from '../types/food.ts'
import './pages.css'

const FUTURE_DAYS = 365

/** Sentinel `lastAppliedNavState` starts as, since a real `location.state` can legitimately be `null` — using `null` itself as the "not applied yet" marker would make the very first run (whose `location.state` often *is* `null`, e.g. arriving via the sidebar) look like it was already applied. */
const NAV_STATE_UNSET = Symbol('nav-state-unset')

type CalendarNavState = {
  /** Set by the Add/Edit Meal pages after a save, so the calendar scrolls back to that meal's date instead of today. */
  scrollToDate?: string
}

function CalendarPage() {
  const location = useLocation()
  const isActive = !!matchPath('/calendar', location.pathname)
  const navigate = useNavigate()
  const [meals, setMeals] = useState<MealListItem[]>([])
  const [mealsLoaded, setMealsLoaded] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpDate, setJumpDate] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportTitle, setReportTitle] = useState('')
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [reportMeals, setReportMeals] = useState<MealListItem[]>([])
  const [reportRange, setReportRange] = useState<[string, string]>(['', ''])
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateRecord[]>([])
  const [expandedWeekStart, setExpandedWeekStart] = useState<string | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [expandedMealRecipes, setExpandedMealRecipes] = useState<Set<string>>(
    new Set(),
  )
  const [recipeEditTarget, setRecipeEditTarget] = useState<{
    mealId: string
    entryIndex: number
  } | null>(null)
  const [recipeEditRestoreRows, setRecipeEditRestoreRows] = useState<
    FoodRow[] | null
  >(null)
  const [prepMeal, setPrepMeal] = useState<MealListItem | null>(null)
  const [mealEnergyUnits, setMealEnergyUnits] = useState<
    Record<string, EnergyUnit>
  >({})
  const { weekStartsOn, dateFormat } = useUserSettings()

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(collection(db, 'users', user.uid, 'meals'), (snapshot) => {
      setMeals(
        snapshot.docs.map(
          (docSnapshot) =>
            ({ id: docSnapshot.id, ...docSnapshot.data() }) as MealListItem,
        ),
      )
      setMealsLoaded(true)
    })
  }, [])

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'exchangeRates'),
      (snapshot) => {
        setExchangeRates(
          snapshot.docs.map((docSnapshot) => docSnapshot.data() as ExchangeRateRecord),
        )
      },
    )
  }, [])

  const { batches: inventoryBatches } = useInventoryBatches()
  const { batches: groupInventoryBatches } = useAllGroupInventoryBatches()
  const pricedMeals = useMemo(
    () =>
      applyInventoryPricing(meals, [...inventoryBatches, ...groupInventoryBatches]).meals,
    [meals, inventoryBatches, groupInventoryBatches],
  )

  const { doses } = useDoses()
  const todayDoseLogs = useTodayDoseLogs()
  const todayDoseStatus = useMemo(() => {
    const now = new Date()
    return aggregateDoseStatus(
      doses.map((dose) =>
        computeDoseStatus(dose, todayDoseLogs[dose.id] ?? [], now),
      ),
    )
  }, [doses, todayDoseLogs])

  const todayStr = toDateStr(new Date())
  const creationDateStr = useMemo(() => {
    const creationTime = auth.currentUser?.metadata?.creationTime
    return creationTime ? toDateStr(new Date(creationTime)) : todayStr
  }, [todayStr])

  const futureEndStr = useMemo(
    () => addDays(todayStr, FUTURE_DAYS),
    [todayStr],
  )

  const timelineDates = useMemo(
    () => buildDateRange(creationDateStr, futureEndStr),
    [creationDateStr, futureEndStr],
  )

  const mealsByDate = useMemo(() => {
    const groups: Record<string, MealListItem[]> = {}
    for (const meal of pricedMeals) {
      const group = (groups[meal.date] ??= [])
      group.push(meal)
    }
    for (const dayMeals of Object.values(groups)) {
      dayMeals.sort((a, b) => MEAL_TIME_ORDER[a.time] - MEAL_TIME_ORDER[b.time])
    }
    return groups
  }, [pricedMeals])


  function scrollToDay(dateStr: string, behavior: ScrollBehavior = 'smooth') {
    const el = document.getElementById(`day-${dateStr}`)
    el?.scrollIntoView({ behavior, block: 'start' })
  }

  function scrollToToday(behavior: ScrollBehavior = 'smooth') {
    scrollToDay(todayStr, behavior)
  }

  // Tracks the last-applied `location.state` (not just "has this effect
  // ever run") so a second save-and-return or a second inline-recipe-food
  // round trip in the same session is still applied — Calendar no longer
  // remounts per navigation (see PageRegistry.tsx), so `mealsLoaded`
  // flipping true only ever happens once per session and can't be relied
  // on as "the user just arrived" the way it could under the old
  // fresh-mount-per-navigation model.
  const lastAppliedNavState = useRef<unknown>(NAV_STATE_UNSET)
  useEffect(() => {
    // Every day's rendered height depends on its meal cards, so scrolling
    // before this collection has loaded once measures against a timeline
    // that's shorter than it's about to become — the moment real meals
    // stream in, days above the target grow taller and push it further
    // down the page without anything re-scrolling to follow. Waiting for
    // the first snapshot (however briefly) means the layout we scroll
    // against is the one that's actually going to stick around.
    if (!mealsLoaded) return
    // Calendar mounts (and this effect can fire) long before it's ever
    // visited — every gated page mounts once for the whole session (see
    // PageRegistry.tsx). `scrollIntoView` is a no-op on an element inside a
    // `hidden` subtree, so scrolling while inactive would silently do
    // nothing and then never retry: the guard below would already treat
    // this `location.state` as "applied" by the time the user actually
    // navigates here. Waiting for `isActive` means the first real scroll
    // attempt happens once there's actually something to scroll.
    if (!isActive) return
    if (location.state === lastAppliedNavState.current) return
    const isFirstRun = lastAppliedNavState.current === NAV_STATE_UNSET
    lastAppliedNavState.current = location.state

    const navState = location.state as
      | CalendarNavState
      | AddFoodNavResult
      | null

    // `'newFood' in navState` distinguishes an inbound `AddFoodNavResult`
    // from the outbound `AddFoodNavRequest` this page's own
    // "mealRecipeOverride" flow briefly leaves in location.state on its
    // way to Add Food (both share `formKind`) — see MealForm.tsx's
    // identical check for why this matters now that this page is
    // permanently mounted (it re-renders, hidden, on every navigation,
    // including the one to Add Food that carries the outbound request).
    if (navState && 'formKind' in navState && 'newFood' in navState) {
      if (navState.formKind === 'mealRecipeOverride') {
        setRecipeEditTarget({
          mealId: navState.mealId,
          entryIndex: navState.entryIndex,
        })
        setRecipeEditRestoreRows([
          ...navState.ingredientRows,
          {
            id: crypto.randomUUID(),
            foodId: navState.newFood.id,
            foodSnapshot: navState.newFood,
            recipeId: '',
            recipeSnapshot: null,
            amount: navState.newFood.quantity.amount,
            unit: navState.newFood.quantity.unit,
          },
        ])
      }
      navigate(location.pathname, { replace: true })
      return
    }

    if (navState?.scrollToDate) {
      scrollToDay(navState.scrollToDate, 'instant')
    } else if (isFirstRun) {
      // Only the very first time Calendar ever mounts this session — no
      // scroll position exists yet to preserve. Every later arrival with no
      // explicit target (e.g. clicking the sidebar link while Calendar was
      // already mounted, just hidden) preserves wherever the user last
      // scrolled instead of jumping back to today; the header's target icon
      // already covers "take me to today" on demand.
      scrollToDay(todayStr, 'instant')
    }
  }, [mealsLoaded, isActive, location.state, location.pathname, navigate, todayStr])

  function openRecipeEditModal(
    e: React.MouseEvent,
    mealId: string,
    entryIndex: number,
  ) {
    e.preventDefault()
    e.stopPropagation()
    setRecipeEditRestoreRows(null)
    setRecipeEditTarget({ mealId, entryIndex })
  }

  const recipeEditMeal = recipeEditTarget
    ? (meals.find((m) => m.id === recipeEditTarget.mealId) ?? null)
    : null

  function handleJumpDateChange(value: string) {
    setJumpDate(value)
    const el = document.getElementById(`day-${value}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setJumpOpen(false)
  }

  function getRangeMealsAndDays(start: string, end: string) {
    const qualifyingDates = timelineDates.filter(
      (d) => d >= start && d <= end,
    )
    const qualifyingDateSet = new Set(qualifyingDates)
    const rangeMeals = pricedMeals.filter((meal) =>
      qualifyingDateSet.has(meal.date),
    )
    return { rangeMeals, days: qualifyingDates.length }
  }

  function openReport(title: string, [start, end]: [string, string]) {
    const { rangeMeals, days } = getRangeMealsAndDays(start, end)

    setReportTitle(title)
    setReportData(computeReport(rangeMeals, days))
    setReportMeals(rangeMeals)
    setReportRange([start, end])
    setReportOpen(true)
  }

  function toggleWeek(start: string) {
    setExpandedWeekStart((current) => (current === start ? null : start))
  }

  function toggleDay(dateStr: string) {
    setExpandedDay((current) => (current === dateStr ? null : dateStr))
  }

  function toggleMealEnergyUnit(mealId: string, currentUnit: EnergyUnit) {
    setMealEnergyUnits((current) => ({
      ...current,
      [mealId]: otherEnergyUnit(currentUnit),
    }))
  }

  function toggleMealRecipe(e: React.MouseEvent, key: string) {
    e.preventDefault()
    e.stopPropagation()
    setExpandedMealRecipes((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <>
      <PageLayout
        header={
          <div className="calendar-header-row">
            <h1>Calendar</h1>
            <button
              type="button"
              className="icon-btn"
              onClick={() => scrollToToday()}
              aria-label="Scroll to today"
            >
              <Icon name="target" size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setJumpOpen(true)}
              aria-label="Jump to date"
            >
              <Icon name="calendar" size={17} />
            </button>
            <Link to="/doses" className="icon-btn" aria-label="Daily doses">
              <Icon name="pill" size={17} />
              {(todayDoseStatus === 'missed' || todayDoseStatus === 'pending') && (
                <span
                  className={`icon-btn-dot${
                    todayDoseStatus === 'missed' ? ' icon-btn-dot-danger' : ''
                  }`}
                  aria-hidden="true"
                />
              )}
            </Link>
          </div>
        }
      >
        <div className="timeline">
          {timelineDates.map((dateStr) => {
          const date = parseDateStr(dateStr)
          const isWeekStart = date.getDay() === weekStartsOn
          const isFirstOfMonth = date.getDate() === 1
          const isJan1 = isFirstOfMonth && date.getMonth() === 0
          const dayMeals = mealsByDate[dateStr] ?? []
          const isToday = dateStr === todayStr

          return (
            <div key={dateStr}>
              {isJan1 && (
                <button
                  type="button"
                  className="timeline-header timeline-header--year"
                  onClick={() => openReport(formatYear(dateStr), yearRange(dateStr))}
                >
                  {formatYear(dateStr)}
                </button>
              )}
              {isFirstOfMonth && (
                <button
                  type="button"
                  className="timeline-header timeline-header--month"
                  onClick={() =>
                    openReport(formatMonthYear(dateStr), monthRange(dateStr))
                  }
                >
                  {formatMonthYear(dateStr)}
                </button>
              )}
              {isWeekStart &&
                (() => {
                  const [start, end] = weekRange(dateStr)
                  const label = `${formatShortDate(start, dateFormat, { includeYear: false })} - ${formatShortDate(end, dateFormat, { includeYear: false })}`
                  const expanded = expandedWeekStart === start
                  return (
                    <>
                      <button
                        type="button"
                        className="timeline-header timeline-header--week"
                        onClick={() => toggleWeek(start)}
                        aria-expanded={expanded}
                      >
                        {label}
                        <Icon name="chevron-down" size={15} />
                      </button>
                      {expanded &&
                        (() => {
                          const { rangeMeals, days } = getRangeMealsAndDays(
                            start,
                            end,
                          )
                          return (
                            <PeriodReportSection
                              key={start}
                              variant="week"
                              meals={rangeMeals}
                              days={days}
                              range={[start, end]}
                              exchangeRates={exchangeRates}
                            />
                          )
                        })()}
                    </>
                  )
                })()}

              <div className="timeline-day" id={`day-${dateStr}`}>
                <button
                  type="button"
                  className={`timeline-date-link${isToday ? ' timeline-date-link--today' : ''}`}
                  onClick={() => toggleDay(dateStr)}
                  aria-expanded={expandedDay === dateStr}
                >
                  {formatDayHeading(dateStr)}
                  {isToday && <span className="meal-time-tag">Today</span>}
                  {dayMeals.length > 0 && (
                    <span className="day-has-meals-dot" aria-hidden="true" />
                  )}
                  <Icon name="chevron-down" size={14} />
                </button>

                {expandedDay === dateStr && (
                  <PeriodReportSection
                    variant="day"
                    meals={dayMeals}
                    days={1}
                    range={[dateStr, dateStr]}
                    exchangeRates={exchangeRates}
                  />
                )}

                {dayMeals.map((meal) => {
                  const handsOnMinutes = mealHandsOnMinutes(meal)
                  const hasFoods = Object.keys(meal.foods ?? {}).length > 0
                  const nutrition = computeReport([meal], 1)
                  const energyUnit =
                    mealEnergyUnits[meal.id] ?? nutrition.dominantEnergyUnit
                  const energyAmount = fromCalories(
                    nutrition.avgCaloriesPerDay,
                    energyUnit,
                  )
                  return (
                  <Link
                    className="meal-card"
                    to={`/meals/${meal.id}/edit`}
                    key={meal.id}
                  >
                    <div className="meal-card-header">
                      {meal.time && (
                        <span className="meal-time-tag">
                          {capitalize(meal.time)}
                        </span>
                      )}
                      {meal.preparedDeductionAt ? (
                        <span className="meal-prepared-tag">
                          <Icon name="check" size={12} />
                          Prepared{' '}
                          {new Date(meal.preparedDeductionAt).toLocaleTimeString(
                            undefined,
                            { hour: 'numeric', minute: '2-digit' },
                          )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Mark as prepared"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setPrepMeal(meal)
                          }}
                        >
                          <Icon name="check" size={13} />
                        </button>
                      )}
                    </div>
                    {handsOnMinutes > 0 && (
                      <p className="meal-hands-on-time">
                        <Icon name="clock" size={12} />
                        Hands-on {formatMinutes(handsOnMinutes)}
                      </p>
                    )}
                    {hasFoods && (
                      <p
                        className="meal-nutrition-summary"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                      >
                        <EnergyToggle
                          amount={energyAmount}
                          unit={energyUnit}
                          onToggle={() =>
                            toggleMealEnergyUnit(meal.id, energyUnit)
                          }
                        />{' '}
                        &middot; {nutrition.avgCarbs.toFixed(1)}g carbs
                        &middot; {nutrition.avgFat.toFixed(1)}g fat &middot;{' '}
                        {nutrition.avgProtein.toFixed(1)}g protein
                        {nutrition.costCurrency && (
                          <>
                            {' '}
                            &middot; {getCurrencySymbol(nutrition.costCurrency)}
                            {nutrition.avgCostPerDay.toFixed(2)}
                          </>
                        )}
                      </p>
                    )}
                    <ul>
                      {(
                        meal.entries ??
                        Object.values(meal.foods ?? {}).map((food) => ({
                          kind: 'food' as const,
                          foodId: '',
                          name: food.name,
                        }))
                      ).map((entry, i) => {
                        if (entry.kind === 'recipe') {
                          const key = `${meal.id}-${i}`
                          const expanded = expandedMealRecipes.has(key)
                          return (
                            <li key={i}>
                              <div className="meal-entry-recipe-row">
                                <button
                                  type="button"
                                  className="meal-entry-recipe"
                                  onClick={(e) =>
                                    openRecipeEditModal(e, meal.id, i)
                                  }
                                >
                                  <Icon name="book" size={12} />
                                  {entry.name}
                                </button>
                                <button
                                  type="button"
                                  className="meal-entry-expand-btn"
                                  aria-expanded={expanded}
                                  aria-label={
                                    expanded
                                      ? 'Collapse ingredients'
                                      : 'Expand ingredients'
                                  }
                                  onClick={(e) => toggleMealRecipe(e, key)}
                                >
                                  <Icon name="chevron-down" size={12} />
                                </button>
                              </div>
                              {expanded && (
                                <ul className="meal-entry-subitems">
                                  {entry.foods.map((food, j) => (
                                    <li key={j}>
                                      <button
                                        type="button"
                                        className="meal-entry-ingredient-link"
                                        onClick={(e) =>
                                          openRecipeEditModal(e, meal.id, i)
                                        }
                                      >
                                        {food.name}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          )
                        }
                        return <li key={i}>{entry.name}</li>
                      })}
                    </ul>
                  </Link>
                  )
                })}

                <Link
                  to={`/plan-meal?date=${dateStr}`}
                  className="btn btn-secondary btn-full"
                >
                  <Icon name="plus" size={16} />
                  Add meal
                </Link>
              </div>
            </div>
          )
        })}
        </div>
      </PageLayout>

      <Modal
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        titleId="jump-title"
        title="Jump to Date"
      >
        <label htmlFor="jump-date">Date</label>
        <input
          id="jump-date"
          type="date"
          min={creationDateStr}
          max={futureEndStr}
          value={jumpDate}
          onChange={(e) => handleJumpDateChange(e.target.value)}
        />
      </Modal>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={reportTitle}
        report={reportData}
        meals={reportMeals}
        range={reportRange}
        exchangeRates={exchangeRates}
      />

      {recipeEditTarget && recipeEditMeal && (
        <RecipeMealEditModal
          open={true}
          onClose={() => setRecipeEditTarget(null)}
          meal={recipeEditMeal}
          entryIndex={recipeEditTarget.entryIndex}
          allMeals={meals}
          restoreRows={recipeEditRestoreRows}
          onRestoreRowsConsumed={() => setRecipeEditRestoreRows(null)}
          onRequestCreateFood={(ingredientRows, query) =>
            navigate('/add-food', {
              state: {
                formKind: 'mealRecipeOverride',
                mealId: recipeEditTarget.mealId,
                entryIndex: recipeEditTarget.entryIndex,
                ingredientRows,
                returnTo: '/calendar',
                prefillName: query,
                navToken: crypto.randomUUID(),
              },
            })
          }
        />
      )}

      <MealPrepTimelineModal
        open={prepMeal !== null}
        onClose={() => setPrepMeal(null)}
        meal={prepMeal}
        batches={inventoryBatches}
      />
    </>
  )
}

export default CalendarPage
