import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import RecipeForm from '../components/RecipeForm.tsx'
import { useRouteParam } from '../hooks/useRouteParam.ts'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import type { AddFoodNavResult } from '../lib/addFoodNav.ts'
import { describeAddedFrom } from '../lib/food.ts'
import { isMealRecipeNavState } from '../lib/mealRecipeNav.ts'
import {
  buildRecipeDocument,
  recipeDocumentToFormValues,
  type RecipeFormValues,
} from '../lib/recipe.ts'
import type { RecipeDocument } from '../types/food.ts'
import './pages.css'

function EditRecipePage() {
  const recipeId = useRouteParam('/recipes/:recipeId/edit', 'recipeId')
  const navigate = useNavigate()
  const location = useLocation()
  // A plain per-render check, not a "once per mount" guard — see
  // EditMealPage's identical comment: RecipeForm itself tracks whether it's
  // already consumed this restore payload and clears location.state once it
  // has, so this only needs to answer "is there a not-yet-cleared
  // recipe-restore payload right now."
  // `'newFood' in state` distinguishes an inbound `AddFoodNavResult` from
  // the outbound `AddFoodNavRequest` RecipeForm briefly leaves in
  // location.state on its way to Add Food (both share `formKind: 'recipe'`)
  // — see MealForm.tsx's identical check for why this matters now that
  // this page is permanently mounted.
  const restoreState = location.state as AddFoodNavResult | null
  const isRestoringRecipe =
    restoreState?.formKind === 'recipe' && 'newFood' in restoreState
  const mealReturn = isMealRecipeNavState(location.state)
    ? location.state
    : null
  const [values, setValues] = useState<RecipeFormValues | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [provenance, setProvenance] = useState<
    Pick<RecipeDocument, 'createdAt' | 'addedFrom'> | null
  >(null)
  const { dateFormat } = useUserSettings()

  useEffect(() => {
    const user = auth.currentUser
    if (!user || !recipeId) return

    // See EditFoodPage.tsx's identical fix: clears the previous recipe's
    // values immediately so switching directly between two recipes' edit
    // pages doesn't seed the freshly `key`-remounted RecipeForm with stale
    // data through the async gap before this fetch resolves.
    setValues(null)
    setProvenance(null)

    getDoc(doc(db, 'users', user.uid, 'recipes', recipeId)).then((snapshot) => {
      if (!snapshot.exists()) {
        setNotFound(true)
        return
      }
      const recipe = snapshot.data() as RecipeDocument
      setValues(recipeDocumentToFormValues(recipe))
      setProvenance({ createdAt: recipe.createdAt, addedFrom: recipe.addedFrom })
    })
  }, [recipeId])

  async function handleSave(formValues: RecipeFormValues) {
    const user = auth.currentUser
    if (!user || !recipeId) return

    await updateDoc(
      doc(db, 'users', user.uid, 'recipes', recipeId),
      buildRecipeDocument(formValues),
    )
    if (mealReturn) {
      // The row(s) referencing this recipe were carrying a snapshot frozen
      // before this edit — clear it so the meal form re-hydrates them from
      // the (now updated) recipes collection instead of showing stale
      // ingredient amounts.
      const refreshedRows = mealReturn.mealValues.rows.map((row) =>
        row.recipeId === recipeId ? { ...row, recipeSnapshot: null } : row,
      )
      navigate(mealReturn.returnTo, {
        state: {
          mealFormReturn: true,
          mealValues: { ...mealReturn.mealValues, rows: refreshedRows },
          returnTo: '',
          navToken: crypto.randomUUID(),
        },
      })
    } else {
      navigate('/recipes')
    }
  }

  async function handleDelete() {
    const user = auth.currentUser
    if (!user || !recipeId) return

    await deleteDoc(doc(db, 'users', user.uid, 'recipes', recipeId))
    if (mealReturn) {
      navigate(mealReturn.returnTo, {
        state: {
          mealFormReturn: true,
          mealValues: mealReturn.mealValues,
          returnTo: '',
          navToken: crypto.randomUUID(),
        },
      })
    } else {
      navigate('/recipes')
    }
  }

  if (notFound) {
    return (
      <section className="page page-center">
        <h1>Recipe not found</h1>
      </section>
    )
  }

  if (!values && !isRestoringRecipe) {
    return (
      <PageLayout header={<h1>Edit Recipe</h1>}>
        <LoadingIndicator />
      </PageLayout>
    )
  }

  return (
    <RecipeForm
      key={recipeId}
      title="Edit Recipe"
      submitLabel="Save Changes"
      savingLabel="Saving..."
      initialValues={values ?? undefined}
      onSubmit={handleSave}
      onDelete={handleDelete}
      resetOnSuccess={false}
      addedFromHint={
        provenance
          ? describeAddedFrom(provenance.createdAt, provenance.addedFrom, dateFormat, 'Recipe')
          : null
      }
    />
  )
}

export default EditRecipePage
