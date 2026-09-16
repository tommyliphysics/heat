# Heat

Shop, cook, track. Heat is a personal nutrition and household-logistics app that ties meal planning, a food/recipe database, shopping, pantry inventory, and supplement/medication dosing together in one place, with optional sharing between household members.

## Features

- **Calendar**: plan meals by day, see nutrition and cost per day, and generate a shopping report over any date range.
- **Foods & Recipes**: your own food and recipe database, with:
  - **Connections tab**: browse and one-click-import foods/recipes a connection has shared with you.
  - **Reference tab**: search AUSNUT, AFCD, and USDA nutrition data (12k+ items) and import straight into your own foods.
  - Nutrition-label scanning (camera or photo upload) to auto-fill a food's macros instead of typing them in by hand.
  - Bulk select to share or import several items at once.
- **Shopping List**: auto-generated from planned meals and low inventory, with manual add/edit.
- **Inventory**: tracks what you actually have on hand, including receipt scanning to log a purchase in one pass.
- **Daily Doses**: recurring or custom (one-off / repeating) supplement and medication schedules, with inventory-linked remaining-stock tracking and low-stock/missed-dose alerts.
- **Network**: connect with other accounts (via a personal connect code) and form groups for shared pantry inventory, with a unanimous-approval flow for changes to shared nutrition/price data.
- Light/dark mode, and a from-scratch design system (no UI framework).

## Tech stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org) + [Vite](https://vite.dev)
- [Firebase](https://firebase.google.com): Auth (email/password + Google), Firestore, Analytics — client-only, no Cloud Functions
- [react-router-dom](https://reactrouter.com) v7
- [Vitest](https://vitest.dev) + [Testing Library](https://testing-library.com) for tests
- [oxlint](https://oxc.rs) for linting

No CSS framework — the whole design system lives in `src/index.css` and `src/pages/pages.css`.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Firebase project's config
npm run dev
```

The dev server serves over HTTPS with a self-signed certificate (via `@vitejs/plugin-basic-ssl`) — this is required for camera access (nutrition-label scanning), which browsers only grant on a secure origin. Accept the certificate warning in your browser on first load.

### Firebase setup

You'll need your own Firebase project with Authentication (Email/Password and Google providers) and Firestore enabled. Fill in `.env` with that project's web app config (see `.env.example` for the exact variable names).

This repo's `firestore.rules` and `firestore.indexes.json` are the source of truth for security rules and composite indexes — deploy them with the Firebase CLI:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Some collection-group queries (e.g. browsing foods/recipes shared with you) need a **single-field index override** that `firestore.indexes.json` can't express — add these manually in the Firebase Console under Firestore → Indexes → Single field, with Collection group scope, for each collection/field pair queried that way (check `lib/` doc comments referencing "collection group scope" for the current list).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with oxlint |

This is a solution-style TypeScript project (`tsconfig.json` has `"files": []` with project references) — a bare `tsc --noEmit` checks nothing; always use `tsc -b` (which is what `npm run build` does) to actually type-check the app.

## Project structure

```
src/
  pages/       route-level page components (one per URL)
  components/  shared/reusable UI components
  hooks/       data-fetching and other reusable React hooks
  lib/         framework-free logic: Firestore reads/writes, calculations, formatting
  types/       shared TypeScript types, grouped by domain
  contexts/    React context providers
  test/        test helpers (fake auth, fake Firestore)
public/
  logo.png     in-app logo (sidebar, landing page)
  icon.png     browser tab / home screen icon
firestore.rules            Firestore security rules
firestore.indexes.json     Firestore composite indexes
```

### A couple of things worth knowing before changing code

- **Persistent single-page shell**: every authenticated route mounts once for the life of the session (`components/PageRegistry.tsx`) and is shown/hidden rather than mounted/unmounted on navigation, so in-progress form state survives navigating away and back. This means a page can render while `hidden`, before it's ever been visited — effects that assume "I just became visible" need to check that explicitly (see `matchPath(...)`-based `isActive` checks in pages like `AddFoodPage.tsx`, `CalendarPage.tsx`).
- **Reference nutrition data**: `public/foodNames.json` is a static, pre-built index (name + source only, no nutrition) used for search/autocomplete; full nutrition is fetched on demand. Regenerating it is a separate offline step, not part of the app build.
