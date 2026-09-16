import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App.tsx'
import { fakeUser, setCurrentUser } from './test/authFake.ts'
import { seedCollection } from './test/firestoreFake.ts'
import type { FoodDocument } from './types/food.ts'

const uid = 'test-uid'

function makeFood(overrides: Partial<FoodDocument> = {}): FoodDocument {
  return {
    name: 'Food A',
    quantity: { amount: '100', unit: 'g' },
    energy: { amount: '100', unit: 'cal' },
    macronutrients: {
      carbs: { amount: '10', unit: 'g' },
      fat: { amount: '5', unit: 'g' },
      protein: { amount: '2', unit: 'g' },
    },
    micronutrients: {},
    price: { amount: '1', currency: 'USD', retailer: '' },
    ...overrides,
  }
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  )
}

/**
 * Every gated page is always in the DOM at once now (see PageRegistry.tsx)
 * — only one `.page-registry-slot` is ever unhidden. Most queries (like
 * `getByLabelText`) don't filter out hidden elements the way `getByRole`
 * does, so tests must scope to the currently-visible page explicitly
 * rather than querying the whole document.
 */
function visiblePage(): HTMLElement {
  const slots = Array.from(
    document.querySelectorAll<HTMLElement>('.page-registry-slot:not([hidden])'),
  )
  if (slots.length === 0) throw new Error('No visible page-registry-slot found')
  // Mid-transition (now true for every navigation, not just back/forward —
  // see PageRegistry.tsx), the outgoing and incoming pages are briefly
  // unhidden at once. The incoming one — what these tests mean by "the
  // visible page" — is the one PageRegistry stacks on top, identified by
  // its higher z-index.
  return slots.find((slot) => slot.style.zIndex === '2') ?? slots[0]
}

beforeEach(() => {
  setCurrentUser(fakeUser({ uid }))
  // Every gated page mounts at once under the persistent-shell architecture
  // (see PageRegistry.tsx) — several (AddFoodPage's currency-from-IP
  // lookup, useFoodNameIndex's static-file fetch) make a real `fetch` call
  // on mount. Stub it out so tests never depend on network access; both
  // callers already handle a rejection gracefully.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network disabled in tests'))),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('persistent single-page architecture — in-progress state survives navigation', () => {
  it('keeps an unsaved Edit Food draft after navigating away and back, but resets when switching to a different food', async () => {
    const user = userEvent.setup()
    seedCollection(`users/${uid}/foods`, {
      'food-a': makeFood({ name: 'Food A' }),
      'food-b': makeFood({ name: 'Food B' }),
    })

    renderApp('/foods/food-a/edit')

    const nameInput = await within(visiblePage()).findByLabelText('Name')
    expect(nameInput).toHaveValue('Food A')

    await user.clear(nameInput)
    await user.type(nameInput, 'Food A EDITED')
    expect(nameInput).toHaveValue('Food A EDITED')

    // Navigate away via the page's own "Foods" breadcrumb link, then
    // back via the real row link in the list — the same paths a user
    // actually takes — instead of driving the router directly. (Not the
    // sidebar's own "Foods" link, since that's a second, ambiguous match
    // for the same accessible name.)
    await user.click(within(visiblePage()).getByRole('link', { name: 'Foods' }))
    expect(
      await within(visiblePage()).findByRole('link', { name: 'Food A' }),
    ).toBeInTheDocument()

    await user.click(within(visiblePage()).getByRole('link', { name: 'Food A' }))
    const nameInputAgain = await within(visiblePage()).findByLabelText('Name')
    expect(nameInputAgain).toHaveValue('Food A EDITED')

    // Now go straight to a DIFFERENT food's edit page — this must show
    // Food B's real data, not Food A's leftover unsaved draft.
    await user.click(within(visiblePage()).getByRole('link', { name: 'Foods' }))
    await user.click(
      await within(visiblePage()).findByRole('link', { name: 'Food B' }),
    )

    const nameInputForB = await within(visiblePage()).findByLabelText('Name')
    expect(nameInputForB).toHaveValue('Food B')
  })

  it('preserves an in-progress Plan Meal draft through the Add Food round trip (the originally reported bug)', async () => {
    const user = userEvent.setup()

    renderApp('/plan-meal')

    const dateInput = await within(visiblePage()).findByLabelText('Date')
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    expect(dateInput).toHaveValue('2026-06-15')

    const timeSelect = within(visiblePage()).getByLabelText('Time')
    await user.selectOptions(timeSelect, 'lunch')

    await user.click(within(visiblePage()).getByRole('button', { name: '+ Add food' }))

    const foodInput = within(visiblePage()).getByLabelText('Food or recipe')
    await user.type(foodInput, 'Broccoli')

    // "Broccoli" matches nothing in the (empty) foods list, so the
    // autocomplete offers "+ New Food" — following it is the exact flow the
    // original bug report described losing the in-progress meal over.
    const newFoodButton = await within(visiblePage()).findByRole('button', {
      name: /New Food/,
    })
    await user.click(newFoodButton)

    const nameInput = await within(visiblePage()).findByLabelText('Name')
    expect(nameInput).toHaveValue('Broccoli')

    await user.click(within(visiblePage()).getByRole('button', { name: 'Add Food' }))

    // Back on Plan Meal: the date/time typed before leaving must still be
    // there, and the row must now hold the food that was just created.
    // `visiblePage()` is re-queried fresh on each retry here (rather than
    // resolved once up front) since the redirect happens after the async
    // `handleSave` (addDoc + navigate) completes, not synchronously with
    // the click — resolving it eagerly would bind `within()` to the Add
    // Food container while it's still the visible one, just before it
    // flips to hidden.
    const dateInputAgain = await waitFor(() =>
      within(visiblePage()).getByLabelText('Date'),
    )
    expect(dateInputAgain).toHaveValue('2026-06-15')
    expect(within(visiblePage()).getByLabelText('Time')).toHaveValue('lunch')

    // The row's new food is applied by MealForm's own restore effect, which
    // fires (and re-renders) slightly after PageRegistry first unhides this
    // page — so this needs its own wait rather than being read immediately.
    await waitFor(() => {
      expect(within(visiblePage()).getByDisplayValue('Broccoli')).toBeInTheDocument()
    })
  })

  it('applies a second "create food inline" round trip on the same Plan Meal draft, not just the first', async () => {
    const user = userEvent.setup()

    renderApp('/plan-meal')

    // First round trip: add a row, search a food that isn't found, create
    // it, and land back with that row filled in.
    await user.click(within(visiblePage()).getByRole('button', { name: '+ Add food' }))
    let foodInputs = within(visiblePage()).getAllByLabelText('Food or recipe')
    await user.type(foodInputs[0], 'Broccoli')
    await user.click(
      await within(visiblePage()).findByRole('button', { name: /New Food/ }),
    )
    await within(visiblePage()).findByLabelText('Name')
    await user.click(within(visiblePage()).getByRole('button', { name: 'Add Food' }))
    // AddFoodPage's own Name field also reads "Broccoli" (from prefillName),
    // so checking for that value alone can't distinguish "back on Plan
    // Meal" from "still stuck on Add Food" — wait for an unambiguous
    // Plan-Meal-only marker (the Date field) first.
    await waitFor(() => within(visiblePage()).getByLabelText('Date'))
    await waitFor(() => {
      expect(within(visiblePage()).getByDisplayValue('Broccoli')).toBeInTheDocument()
    })

    // MealForm never remounts across this whole flow (Plan Meal's `key` is
    // stable with no `?date=`) — its restore-effect ref must still pick up
    // this SECOND round trip rather than silently no-op the way the old
    // `useState`/`useRef(false)` "applied once" guards did.
    await user.click(within(visiblePage()).getByRole('button', { name: '+ Add food' }))
    foodInputs = within(visiblePage()).getAllByLabelText('Food or recipe')
    const secondRowInput = foodInputs[foodInputs.length - 1]
    await user.type(secondRowInput, 'Carrot')
    await user.click(
      await within(visiblePage()).findByRole('button', { name: /New Food/ }),
    )
    await within(visiblePage()).findByLabelText('Name')
    await user.click(within(visiblePage()).getByRole('button', { name: 'Add Food' }))

    await waitFor(() => within(visiblePage()).getByLabelText('Date'))
    await waitFor(() => {
      expect(within(visiblePage()).getByDisplayValue('Carrot')).toBeInTheDocument()
    })
    // The first round trip's row must still be there too.
    expect(within(visiblePage()).getByDisplayValue('Broccoli')).toBeInTheDocument()
  })

  it('applies scrollToDate on Calendar for a second Edit Meal save in the same session, not just the first', async () => {
    const user = userEvent.setup()
    // Calendar's timeline only renders days from today through +365 days —
    // these dates must stay inside that window or their `day-<date>`
    // element (the scroll target) never exists in the DOM.
    seedCollection(`users/${uid}/meals`, {
      'meal-1': { date: '2026-09-05', time: 'lunch', foods: {}, entries: [] },
    })
    // Calendar no longer remounts per navigation (see PageRegistry.tsx), so
    // its old `useState`/`useRef(false)` "have I ever applied a nav state"
    // guard would silently no-op on a SECOND scrollToDate in one session —
    // this is exactly the class of bug that guard had and a single-save
    // test wouldn't catch. Spying on scrollIntoView (polyfilled as a no-op
    // in test/setup.ts) lets each save's scroll target be checked directly.
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')

    renderApp('/meals/meal-1/edit')

    // CalendarPage mounts hidden alongside Edit Meal and scrolls to today on
    // its own first run, independent of which page is visible — let that
    // settle and clear it before driving the actual save flow, so later
    // assertions on the spy's most recent call aren't racing against it.
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled())
    scrollSpy.mockClear()

    const dateInput = await within(visiblePage()).findByLabelText('Date')
    expect(dateInput).toHaveValue('2026-09-05')

    fireEvent.change(dateInput, { target: { value: '2026-09-10' } })
    await user.click(within(visiblePage()).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(scrollSpy.mock.instances.at(-1)).toHaveProperty('id', 'day-2026-09-10')
    })

    const mealCardLink = await waitFor(() => {
      const link = visiblePage().querySelector<HTMLAnchorElement>(
        'a[href="/meals/meal-1/edit"]',
      )
      if (!link) throw new Error('Meal card link not found yet')
      return link
    })
    await user.click(mealCardLink)

    const dateInputAgain = await within(visiblePage()).findByLabelText('Date')
    expect(dateInputAgain).toHaveValue('2026-09-10')

    fireEvent.change(dateInputAgain, { target: { value: '2026-09-20' } })
    await user.click(within(visiblePage()).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(scrollSpy.mock.instances.at(-1)).toHaveProperty('id', 'day-2026-09-20')
    })
    expect(scrollSpy.mock.calls.length).toBeGreaterThanOrEqual(2)

    scrollSpy.mockRestore()
  })
})

describe('back/forward navigation — history stack, Forward button, slide transition', () => {
  it(
    'shows the Forward button only once the user has gone back, and hides it again once back at the front of the stack',
    async () => {
      const user = userEvent.setup()
      renderApp('/dashboard')

      expect(
        within(document.body).queryByRole('button', { name: 'Forward' }),
      ).not.toBeInTheDocument()

      // A normal Link click (PUSH) — nothing to go forward to yet.
      await user.click(within(document.body).getByRole('link', { name: 'Foods' }))
      await within(visiblePage()).findByRole('heading', { name: 'Foods' })
      expect(
        within(document.body).queryByRole('button', { name: 'Forward' }),
      ).not.toBeInTheDocument()

      // Going back (POP) leaves somewhere to go forward to.
      await user.click(within(document.body).getByRole('button', { name: 'Back' }))
      await waitFor(() => {
        expect(
          within(document.body).getByRole('button', { name: 'Forward' }),
        ).toBeInTheDocument()
      })

      // Using it returns to the front of the stack — nothing forward from
      // here. `visiblePage()` is re-queried fresh on each retry (not
      // resolved once up front) since the slide transition means the
      // previously-visible page is still the one
      // `.page-registry-slot:not([hidden])` would return for a moment after
      // the click.
      await user.click(within(document.body).getByRole('button', { name: 'Forward' }))
      await waitFor(() =>
        within(visiblePage()).getByRole('heading', { name: 'Foods' }),
      )
      await waitFor(() => {
        expect(
          within(document.body).queryByRole('button', { name: 'Forward' }),
        ).not.toBeInTheDocument()
      })
    },
    90000,
  )

  it(
    'slides both pages briefly visible on a back navigation, then settles to just the one navigated to',
    async () => {
      const user = userEvent.setup()
      renderApp('/dashboard')

      await user.click(within(document.body).getByRole('link', { name: 'Foods' }))
      await within(visiblePage()).findByRole('heading', { name: 'Foods' })

      await user.click(within(document.body).getByRole('button', { name: 'Back' }))

      // Mid-transition, both the outgoing (Foods) and incoming (Dashboard)
      // slots are unhidden at once — that's what makes the slide visible,
      // not a flicker to catch on a lucky poll.
      await waitFor(() => {
        expect(document.querySelectorAll('.page-registry-slot:not([hidden])').length).toBe(2)
      })

      // Once the transition's timer clears it, only Dashboard remains.
      await waitFor(() => {
        expect(document.querySelectorAll('.page-registry-slot:not([hidden])').length).toBe(1)
      })
      expect(
        within(visiblePage()).getByRole('link', { name: 'Open calendar' }),
      ).toBeInTheDocument()
    },
    20000,
  )

  it(
    'also slides on a plain forward (PUSH) navigation, arriving from the right like a forward step',
    async () => {
      const user = userEvent.setup()
      renderApp('/dashboard')

      await user.click(within(document.body).getByRole('link', { name: 'Foods' }))

      // Mid-transition, both the outgoing (Dashboard) and incoming (My
      // Foods) slots are unhidden at once, same as a POP navigation would.
      await waitFor(() => {
        expect(document.querySelectorAll('.page-registry-slot:not([hidden])').length).toBe(2)
      })

      // Once the transition's timer clears it, only Foods remains.
      await waitFor(() => {
        expect(document.querySelectorAll('.page-registry-slot:not([hidden])').length).toBe(1)
      })
      expect(
        within(visiblePage()).getByRole('heading', { name: 'Foods' }),
      ).toBeInTheDocument()
    },
    20000,
  )
})
