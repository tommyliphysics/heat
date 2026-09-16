import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import Icon from '../components/Icon.tsx'
import PageLayout from '../components/PageLayout.tsx'
import TodayDosesSection from '../components/TodayDosesSection.tsx'
import TodayMealsSection from '../components/TodayMealsSection.tsx'
import TodayShoppingSection from '../components/TodayShoppingSection.tsx'
import { formatDayHeading, MEAL_TIME_ORDER, toDateStr } from '../lib/timeline.ts'
import type { MealListItem } from '../types/food.ts'
import './pages.css'

function DashboardPage() {
  const todayStr = toDateStr(new Date())
  const [meals, setMeals] = useState<MealListItem[]>([])
  const [mealsLoaded, setMealsLoaded] = useState(false)

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

  const todayMeals = useMemo(
    () =>
      meals
        .filter((meal) => meal.date === todayStr)
        .sort((a, b) => MEAL_TIME_ORDER[a.time] - MEAL_TIME_ORDER[b.time]),
    [meals, todayStr],
  )

  return (
    <PageLayout
      header={
        <div className="calendar-header-row">
          <h1>{formatDayHeading(todayStr)}</h1>
          <Link to="/calendar" className="icon-btn" aria-label="Open calendar">
            <Icon name="calendar" size={17} />
          </Link>
        </div>
      }
    >
      <TodayMealsSection
        meals={todayMeals}
        loaded={mealsLoaded}
        todayStr={todayStr}
      />
      <TodayShoppingSection meals={todayMeals} loaded={mealsLoaded} />
      <TodayDosesSection />
    </PageLayout>
  )
}

export default DashboardPage
