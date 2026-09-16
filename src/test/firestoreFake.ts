import { vi } from 'vitest'

/**
 * A minimal in-memory stand-in for the `firebase/firestore` functions this
 * app actually uses (collection, collectionGroup, doc, onSnapshot, getDoc,
 * getDocs, addDoc, updateDoc, deleteDoc, setDoc, deleteField, writeBatch,
 * runTransaction, query, where) — not a full Firestore emulator. Every
 * exported SDK function is a `vi.fn()` wrapping real (in-memory) behavior,
 * so a test can both drive data through it and assert on how it was
 * called.
 *
 * Wired up globally in `src/test/setup.ts` via `vi.mock('firebase/firestore', ...)`,
 * so any page/component under test that imports `collection`/`doc`/etc. (or
 * `db` from `../firebase.ts`, which is just re-exported from here) gets this
 * fake instead of talking to real Firestore.
 *
 * Known limitations:
 * - `updateDoc` does a shallow merge — it does not special-case dotted
 *   field-path keys (e.g. `"foods.abc.price.amount"`) the way real
 *   Firestore treats them as a nested-field update. None of the
 *   currently-tested pages rely on that; a test that needs it will have to
 *   teach `updateDoc` about dotted paths first.
 * - `where()` supports `==`, `>=`, `<=`, `>`, `<` (each constraint applied
 *   independently — no composite-index awareness, since this fake doesn't
 *   need one). `in`/`array-contains`/etc. aren't implemented; add them here
 *   if a test needs one.
 * - `runTransaction` runs its callback exactly once against current state —
 *   no real optimistic-concurrency retry loop, since there's no concurrent
 *   writer to retry against in a single test process. Fine for asserting
 *   "given this state, does the transaction compute/write the right
 *   result" — it can't exercise the actual race-safety a real transaction
 *   provides (see `lib/inventoryReconcile.ts`'s `reconcileGroupInventory`).
 */

export type FakeDb = { __fakeDb: true }
export const db: FakeDb = { __fakeDb: true }

/** `../firebase.ts` calls this (as `getFirestore(app)`) to produce the `db` it exports — returning our marker here is what makes that `db` the fake one everywhere in the app. */
export const getFirestore = vi.fn((): FakeDb => db)

type DocData = Record<string, unknown>

type WhereConstraint = { field: string; op: string; value: unknown }

type CollectionRef = { __kind: 'collection'; path: string }
type DocRef = { __kind: 'doc'; path: string }
type CollectionGroupRef = { __kind: 'collectionGroup'; collectionId: string }
type QueryRef = {
  __kind: 'query'
  path?: string
  collectionId?: string
  constraints: WhereConstraint[]
}
type Ref = CollectionRef | DocRef | CollectionGroupRef | QueryRef

/** Mimics enough of a real `DocumentReference` for `memberDoc.ref.parent.parent?.id` (see `useGroups.ts`) — `parent.parent.id` is the id of the document two levels up (e.g. for `groups/g1/members/uid1`, that's `g1`). */
type FakeDocRef = { parent: { parent: { id: string } | null } }
type QueryDocSnapshot = { id: string; data: () => DocData; ref: FakeDocRef }
type QuerySnapshot = { docs: QueryDocSnapshot[] }
type DocSnapshot = { exists: () => boolean; data: () => DocData | undefined; id: string }

type CollectionListener = {
  constraints: WhereConstraint[]
  callback: (snapshot: QuerySnapshot) => void
}

const collections = new Map<string, Map<string, DocData>>()
const collectionListeners = new Map<string, Set<CollectionListener>>()
/** Keyed by collection id (e.g. `"members"`), not full path — a collection-group query spans every collection anywhere in the store with that id, so it can't be matched by a single path key the way `collectionListeners` is. */
const collectionGroupListeners = new Map<string, Set<CollectionListener>>()
const docListeners = new Map<string, Set<(data: DocData | undefined) => void>>()

function collectionMap(path: string): Map<string, DocData> {
  let map = collections.get(path)
  if (!map) {
    map = new Map()
    collections.set(path, map)
  }
  return map
}

function splitDocPath(path: string): [collectionPath: string, id: string] {
  const segments = path.split('/')
  const id = segments.pop() ?? ''
  return [segments.join('/'), id]
}

/** The codebase only ever calls `collection(db, ...segments)` / `doc(db, ...segments)` with plain string path segments (never a chained reference) — see the grep in this file's doc comment. */
function pathOf(args: unknown[]): string {
  return args
    .slice(1)
    .filter((segment): segment is string => typeof segment === 'string')
    .join('/')
}

function matchesConstraints(data: DocData, constraints: WhereConstraint[]): boolean {
  return constraints.every(({ field, op, value }) => {
    const actual = data[field]
    switch (op) {
      case '==':
        return actual === value
      case '>=':
        return (actual as never) >= (value as never)
      case '<=':
        return (actual as never) <= (value as never)
      case '>':
        return (actual as never) > (value as never)
      case '<':
        return (actual as never) < (value as never)
      default:
        throw new Error(`firestoreFake: unsupported where() operator "${op}"`)
    }
  })
}

function docRefFor(collectionPath: string): FakeDocRef {
  const segments = collectionPath.split('/')
  const grandparentId = segments.length >= 2 ? segments[segments.length - 2] : null
  return { parent: { parent: grandparentId ? { id: grandparentId } : null } }
}

function snapshotDocs(path: string, constraints: WhereConstraint[]): QueryDocSnapshot[] {
  return [...collectionMap(path).entries()]
    .filter(([, data]) => matchesConstraints(data, constraints))
    .map(([id, data]) => ({ id, data: () => data, ref: docRefFor(path) }))
}

/** A collection-group query spans every collection anywhere in the store whose path ends in `collectionId`, regardless of what precedes it — mirrors real Firestore's `collectionGroup()`. */
function snapshotGroupDocs(
  collectionId: string,
  constraints: WhereConstraint[],
): QueryDocSnapshot[] {
  const results: QueryDocSnapshot[] = []
  for (const path of collections.keys()) {
    if (path.split('/').pop() !== collectionId) continue
    results.push(...snapshotDocs(path, constraints))
  }
  return results
}

function notifyCollection(path: string) {
  for (const listener of collectionListeners.get(path) ?? []) {
    listener.callback({ docs: snapshotDocs(path, listener.constraints) })
  }

  const collectionId = path.split('/').pop()
  if (!collectionId) return
  for (const listener of collectionGroupListeners.get(collectionId) ?? []) {
    listener.callback({ docs: snapshotGroupDocs(collectionId, listener.constraints) })
  }
}

function notifyDoc(path: string) {
  const [collectionPath, id] = splitDocPath(path)
  const data = collectionMap(collectionPath).get(id)
  for (const callback of docListeners.get(path) ?? []) callback(data)
}

export const collection = vi.fn((...args: unknown[]): CollectionRef => ({
  __kind: 'collection',
  path: pathOf(args),
}))

export const doc = vi.fn((...args: unknown[]): DocRef => ({
  __kind: 'doc',
  path: pathOf(args),
}))

/** Unlike `collection()`, this takes no `db`-relative path segments — just the bare collection id (e.g. `"members"`) shared by every matching collection anywhere in the store. */
export const collectionGroup = vi.fn(
  (_db: FakeDb, collectionId: string): CollectionGroupRef => ({
    __kind: 'collectionGroup',
    collectionId,
  }),
)

export const where = vi.fn(
  (field: string, op: string, value: unknown): WhereConstraint => ({
    field,
    op,
    value,
  }),
)

export const query = vi.fn(
  (ref: CollectionRef | CollectionGroupRef, ...constraints: WhereConstraint[]): QueryRef =>
    ref.__kind === 'collectionGroup'
      ? { __kind: 'query', collectionId: ref.collectionId, constraints }
      : { __kind: 'query', path: ref.path, constraints },
)

export const onSnapshot = vi.fn(
  (ref: Ref, callback: (snapshot: DocSnapshot | QuerySnapshot) => void) => {
    if (ref.__kind === 'doc') {
      const [collectionPath, id] = splitDocPath(ref.path)
      const listener = (data: DocData | undefined) => {
        callback({ exists: () => data !== undefined, data: () => data, id })
      }
      const set = docListeners.get(ref.path) ?? new Set()
      set.add(listener)
      docListeners.set(ref.path, set)
      listener(collectionMap(collectionPath).get(id))
      return () => set.delete(listener)
    }

    const collectionId =
      ref.__kind === 'collectionGroup'
        ? ref.collectionId
        : ref.__kind === 'query'
          ? ref.collectionId
          : undefined
    const constraints = ref.__kind === 'query' ? ref.constraints : []

    if (collectionId) {
      const listener: CollectionListener = {
        constraints,
        callback: callback as CollectionListener['callback'],
      }
      const set = collectionGroupListeners.get(collectionId) ?? new Set()
      set.add(listener)
      collectionGroupListeners.set(collectionId, set)
      callback({ docs: snapshotGroupDocs(collectionId, constraints) })
      return () => set.delete(listener)
    }

    // `ref` can only be a `CollectionRef` or a path-based `QueryRef` here —
    // the collection-group case (the only other union member with no
    // `.path`) already returned above via the `collectionId` check, but that
    // narrowed the `collectionId` local rather than `ref.__kind` itself, so
    // TS still needs telling directly to allow reading `ref.path` below.
    const path = ref.__kind === 'query' ? (ref.path ?? '') : ref.__kind === 'collection' ? ref.path : ''
    const listener: CollectionListener = { constraints, callback: callback as CollectionListener['callback'] }
    const set = collectionListeners.get(path) ?? new Set()
    set.add(listener)
    collectionListeners.set(path, set)
    callback({ docs: snapshotDocs(path, constraints) })
    return () => set.delete(listener)
  },
)

export const getDoc = vi.fn(async (ref: DocRef): Promise<DocSnapshot> => {
  const [collectionPath, id] = splitDocPath(ref.path)
  const data = collectionMap(collectionPath).get(id)
  return { exists: () => data !== undefined, data: () => data, id }
})

export const getDocs = vi.fn(
  async (ref: CollectionRef | CollectionGroupRef | QueryRef): Promise<QuerySnapshot> => {
    if (ref.__kind === 'collectionGroup') {
      return { docs: snapshotGroupDocs(ref.collectionId, []) }
    }
    const constraints = ref.__kind === 'query' ? ref.constraints : []
    if (ref.__kind === 'query' && ref.collectionId) {
      return { docs: snapshotGroupDocs(ref.collectionId, constraints) }
    }
    const path = ref.__kind === 'query' ? (ref.path ?? '') : ref.path
    return { docs: snapshotDocs(path, constraints) }
  },
)

/** The sentinel `deleteField()` returns — `applyFieldDeletes` strips any key holding this out of a merged document, same as real Firestore removing it from storage. */
const DELETE_FIELD = Symbol('deleteField')
export const deleteField = vi.fn(() => DELETE_FIELD)

function applyFieldDeletes(data: DocData): DocData {
  const result = { ...data }
  for (const [key, value] of Object.entries(result)) {
    if (value === DELETE_FIELD) delete result[key]
  }
  return result
}

function applySet(path: string, id: string, data: DocData, merge?: boolean): void {
  const map = collectionMap(path)
  const existing = map.get(id)
  map.set(id, applyFieldDeletes(merge && existing ? { ...existing, ...data } : data))
  notifyCollection(path)
  notifyDoc(`${path}/${id}`)
}

function applyUpdate(path: string, id: string, data: DocData): void {
  const map = collectionMap(path)
  map.set(id, applyFieldDeletes({ ...(map.get(id) ?? {}), ...data }))
  notifyCollection(path)
  notifyDoc(`${path}/${id}`)
}

function applyDelete(path: string, id: string): void {
  collectionMap(path).delete(id)
  notifyCollection(path)
  notifyDoc(`${path}/${id}`)
}

export const addDoc = vi.fn(async (ref: CollectionRef, data: DocData) => {
  const id = `fake-${collectionMap(ref.path).size}-${Math.random().toString(36).slice(2, 8)}`
  collectionMap(ref.path).set(id, applyFieldDeletes(data))
  notifyCollection(ref.path)
  return { id }
})

export const setDoc = vi.fn(
  async (ref: DocRef, data: DocData, options?: { merge?: boolean }) => {
    const [collectionPath, id] = splitDocPath(ref.path)
    applySet(collectionPath, id, data, options?.merge)
  },
)

export const updateDoc = vi.fn(async (ref: DocRef, data: DocData) => {
  const [collectionPath, id] = splitDocPath(ref.path)
  applyUpdate(collectionPath, id, data)
})

export const deleteDoc = vi.fn(async (ref: DocRef) => {
  const [collectionPath, id] = splitDocPath(ref.path)
  applyDelete(collectionPath, id)
})

/** Applies every queued operation synchronously on `commit()` — real batches are atomic; this fake doesn't need to model partial-failure rollback for the tests that use it. */
export const writeBatch = vi.fn(() => {
  const ops: (() => void)[] = []
  const batch = {
    set(ref: DocRef, data: DocData, options?: { merge?: boolean }) {
      const [path, id] = splitDocPath(ref.path)
      ops.push(() => applySet(path, id, data, options?.merge))
      return batch
    },
    update(ref: DocRef, data: DocData) {
      const [path, id] = splitDocPath(ref.path)
      ops.push(() => applyUpdate(path, id, data))
      return batch
    },
    delete(ref: DocRef) {
      const [path, id] = splitDocPath(ref.path)
      ops.push(() => applyDelete(path, id))
      return batch
    },
    async commit() {
      for (const op of ops) op()
    },
  }
  return batch
})

/**
 * Runs `updateFunction` once against current state — no real optimistic-
 * concurrency retry loop, since this fake has no concurrent writers to
 * retry against. `transaction.get` reads synchronously from the same store
 * `getDoc` does; `.set`/`.update`/`.delete` apply immediately rather than
 * being deferred to a real commit point, which is observably different
 * from real Firestore only if `updateFunction` reads a value back through
 * `getDoc`/`onSnapshot` (bypassing `transaction.get`) after writing it
 * within the same transaction — none of this codebase's transactions do
 * that.
 */
export const runTransaction = vi.fn(
  async <T>(
    _db: FakeDb,
    updateFunction: (transaction: {
      get: (ref: DocRef) => Promise<DocSnapshot>
      set: (ref: DocRef, data: DocData, options?: { merge?: boolean }) => void
      update: (ref: DocRef, data: DocData) => void
      delete: (ref: DocRef) => void
    }) => Promise<T>,
  ): Promise<T> => {
    return updateFunction({
      get: getDoc,
      set: (ref, data, options) => {
        const [path, id] = splitDocPath(ref.path)
        applySet(path, id, data, options?.merge)
      },
      update: (ref, data) => {
        const [path, id] = splitDocPath(ref.path)
        applyUpdate(path, id, data)
      },
      delete: (ref) => {
        const [path, id] = splitDocPath(ref.path)
        applyDelete(path, id)
      },
    })
  },
)

// --- test-facing helpers (not part of the firebase/firestore surface) ---

/** Seeds a collection (path like `"users/uid/doses"`) with docs keyed by id, notifying any listeners already attached. */
export function seedCollection(path: string, docs: Record<string, DocData>) {
  const map = collectionMap(path)
  for (const [id, data] of Object.entries(docs)) map.set(id, data)
  notifyCollection(path)
}

/** Reads back every doc currently stored at `path`, for asserting what a page wrote. */
export function readCollection(path: string): (DocData & { id: string })[] {
  return [...collectionMap(path).entries()].map(([id, data]) => ({ id, ...data }))
}

/** Clears all seeded data, listeners, and mock call histories — call from `afterEach`. */
export function resetFirestoreFake() {
  collections.clear()
  collectionListeners.clear()
  collectionGroupListeners.clear()
  docListeners.clear()
  for (const fn of [
    getFirestore,
    collection,
    collectionGroup,
    doc,
    where,
    query,
    onSnapshot,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    deleteField,
    writeBatch,
    runTransaction,
  ]) {
    fn.mockClear()
  }
}
