import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import EnergyToggle from '../components/EnergyToggle.tsx'
import Icon from '../components/Icon.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { getCurrencySymbol } from '../data/currencies.ts'
import { useRouteParam } from '../hooks/useRouteParam.ts'
import { foodsMapToRows } from '../lib/foodRow.ts'
import { computeRecipeNutritionPerServe } from '../lib/recipe.ts'
import { formatMinutes } from '../lib/time.ts'
import { convertEnergy, otherEnergyUnit } from '../lib/units.ts'
import type { EnergyUnit, FoodDocument, RecipeDocument } from '../types/food.ts'
import './pages.css'

function ViewRecipePage() {
  const recipeId = useRouteParam('/recipes/:recipeId', 'recipeId')
  const [recipe, setRecipe] = useState<RecipeDocument | null>(null)
  const [currentFoods, setCurrentFoods] = useState<
    Record<string, FoodDocument>
  >({})
  const [notFound, setNotFound] = useState(false)
  const [energyDisplayUnit, setEnergyDisplayUnit] = useState<EnergyUnit | null>(
    null,
  )

  useEffect(() => {
    const user = auth.currentUser
    if (!user || !recipeId) return

    // Clears the previous recipe immediately so navigating directly between
    // two recipes' view pages doesn't briefly show the old recipe's
    // content under the new id while this fetch is still in flight (this
    // page is permanently mounted, see PageRegistry.tsx, so its state no
    // longer resets on its own between visits the way an unmount would).
    setRecipe(null)

    getDoc(doc(db, 'users', user.uid, 'recipes', recipeId)).then((snapshot) => {
      if (!snapshot.exists()) {
        setNotFound(true)
        return
      }
      setRecipe(snapshot.data() as RecipeDocument)
    })
  }, [recipeId])

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    getDocs(collection(db, 'users', user.uid, 'foods')).then((snapshot) => {
      setCurrentFoods(
        Object.fromEntries(
          snapshot.docs.map((docSnapshot) => [
            docSnapshot.id,
            docSnapshot.data() as FoodDocument,
          ]),
        ),
      )
    })
  }, [])

  if (notFound) {
    return <PageLayout header={<h1>Recipe not found</h1>} />
  }

  if (!recipe) {
    return (
      <PageLayout header={<h1>Recipe</h1>}>
        <LoadingIndicator />
      </PageLayout>
    )
  }

  const rows = foodsMapToRows(recipe.foods)
  const nutrition = computeRecipeNutritionPerServe(recipe, currentFoods)
  const energyUnit = energyDisplayUnit ?? nutrition.energyUnit
  const energyAmount = convertEnergy(
    nutrition.energyAmount,
    nutrition.energyUnit,
    energyUnit,
  )

  return (
    <PageLayout
      header={
        <>
          <Link to="/recipes" className="top-link">
            <Icon name="book" size={13} />
            Recipes
          </Link>
          <Link to={`/recipes/${recipeId}/edit`} className="top-link">
            <Icon name="pencil" size={13} />
            Edit recipe
          </Link>

          <h1>{recipe.name}</h1>
          <p className="recipe-servings">
            Serves {recipe.servings}
            {Number(recipe.handsOnTime) > 0 && (
              <>
                {' '}
                &middot;{' '}
                <span className="hands-on-label">
                  <Icon name="clock" size={13} />
                  Hands-on {formatMinutes(Number(recipe.handsOnTime))}
                </span>
              </>
            )}
            {Number(recipe.prepTime) > 0 && (
              <> &middot; Prep {formatMinutes(Number(recipe.prepTime))}</>
            )}
            {Number(recipe.cookTime) > 0 && (
              <> &middot; Cook {formatMinutes(Number(recipe.cookTime))}</>
            )}
          </p>

          {rows.length > 0 && (
            <p className="recipe-nutrition-summary">
              <EnergyToggle
                amount={energyAmount}
                unit={energyUnit}
                onToggle={() =>
                  setEnergyDisplayUnit(otherEnergyUnit(energyUnit))
                }
              />{' '}
              &middot; {nutrition.carbs.toFixed(1)}g carbs &middot;{' '}
              {nutrition.fat.toFixed(1)}g fat &middot;{' '}
              {nutrition.protein.toFixed(1)}g protein
              {nutrition.costPerServe !== null && (
                <>
                  {' '}
                  &middot; {getCurrencySymbol(nutrition.costCurrency ?? '')}
                  {nutrition.costPerServe.toFixed(2)}
                </>
              )}
              /serve
            </p>
          )}
        </>
      }
    >
      <div className="auth-form">
        <h2 className="form-section-heading">Ingredients</h2>
        {rows.length === 0 ? (
          <p>No ingredients added.</p>
        ) : (
          <ul className="ingredient-list">
            {rows.map((row) => (
              <li key={row.id}>
                <span>{row.foodSnapshot?.name}</span>
                <span>
                  {row.amount} {row.unit}
                </span>
              </li>
            ))}
          </ul>
        )}

        {recipe.equipment && recipe.equipment.length > 0 && (
          <>
            <h2 className="form-section-heading">Required Equipment</h2>
            <ul className="equipment-list">
              {recipe.equipment.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        )}

        <h2 className="form-section-heading">Method</h2>
        <p className="recipe-text">
          {recipe.recipeText || 'No recipe text added.'}
        </p>
      </div>
    </PageLayout>
  )
}

export default ViewRecipePage
