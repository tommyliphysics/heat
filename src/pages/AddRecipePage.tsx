import { useRef } from 'react'
import { addDoc, collection } from 'firebase/firestore'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase.ts'
import RecipeForm from '../components/RecipeForm.tsx'
import type { AddRecipeNavRequest } from '../lib/addRecipeNav.ts'
import { buildRecipeDocument, type RecipeFormValues } from '../lib/recipe.ts'

function AddRecipePage() {
  const location = useLocation()
  const navigate = useNavigate()
  // Freezes at its last value while this page isn't the active route, same
  // reasoning as AddFoodPage.tsx's identical guard: this page stays
  // permanently mounted (see PageRegistry.tsx), so reading location.state
  // live would pick up whatever unrelated state a later, different
  // navigation happens to carry.
  const isActive = !!matchPath('/add-recipe', location.pathname)
  const lastRequest = useRef<AddRecipeNavRequest | null>(null)
  if (isActive) {
    lastRequest.current = location.state as AddRecipeNavRequest | null
  }
  const request = lastRequest.current

  async function handleSave(values: RecipeFormValues) {
    const user = auth.currentUser
    if (!user) return

    await addDoc(collection(db, 'users', user.uid, 'recipes'), {
      ...buildRecipeDocument(values),
      createdAt: Date.now(),
      ...(request ? { addedFrom: request.addedFrom } : {}),
    })

    // The Connections tab's "Add to My Recipes" flow has no in-progress
    // caller form to hand a result back to — just land back where it came
    // from and let the Recipes page's own live listener pick up the new
    // recipe (mirrors AddFoodPage's 'import' handling).
    navigate(request?.returnTo ?? '/recipes')
  }

  return (
    <RecipeForm
      key={request?.navToken ?? 'blank'}
      title="Add Recipe"
      submitLabel="Save Recipe"
      savingLabel="Saving..."
      initialValues={request?.prefillValues}
      onSubmit={handleSave}
      resetOnSuccess={false}
    />
  )
}

export default AddRecipePage
