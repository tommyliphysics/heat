import { Link } from 'react-router-dom'
import Icon from './Icon.tsx'
import LoadingIndicator from './LoadingIndicator.tsx'
import { capitalize } from '../lib/timeline.ts'
import { computeReport } from '../lib/report.ts'
import type { MealListItem } from '../types/food.ts'

type TodayMealsSectionProps = {
  meals: MealListItem[]
  loaded: boolean
  todayStr: string
}

function TodayMealsSection({ meals, loaded, todayStr }: TodayMealsSectionProps) {
  const report = meals.length > 0 ? computeReport(meals, 1) : null

  return (
    <section className="dashboard-section">
      <h2 className="dashboard-section-heading">
        <Link to="/calendar">
          <Icon name="calendar" size={16} />
          Meals
        </Link>
        <Link
          to={`/plan-meal?date=${todayStr}`}
          className="icon-btn"
          aria-label="Add meal"
        >
          <Icon name="plus" size={16} />
        </Link>
      </h2>

      {report && (
        <p className="dashboard-section-summary">
          {Math.round(report.avgCaloriesPerDay)} {report.dominantEnergyUnit} ·{' '}
          {report.avgProtein.toFixed(0)}g protein · {report.avgCarbs.toFixed(0)}g
          carbs · {report.avgFat.toFixed(0)}g fat
        </p>
      )}

      {!loaded ? (
        <LoadingIndicator />
      ) : meals.length === 0 ? (
        <p>No meals planned for today.</p>
      ) : (
        <ul className="dashboard-list">
          {meals.map((meal) => {
            const names = (
              meal.entries ??
              Object.values(meal.foods ?? {}).map((food) => food.name)
            )
              .map((entry) => (typeof entry === 'string' ? entry : entry.name))
              .join(', ')

            return (
              <li key={meal.id}>
                <Link to={`/meals/${meal.id}/edit`} className="dashboard-row">
                  {meal.time && (
                    <span className="meal-time-tag">{capitalize(meal.time)}</span>
                  )}
                  <span>{names || 'Empty meal'}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default TodayMealsSection
