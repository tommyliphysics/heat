import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase.ts'

/**
 * Creates the group doc, then adds the creator as its first member — two
 * separate writes, not one batch: the member-doc create rule reads the
 * group doc's `createdBy` via `get()` to bootstrap, and a batch evaluates
 * every write's rule against the state *before* the batch, so the group
 * doc has to actually exist (a prior, already-committed write) before that
 * check can pass. `kind` defaults to `'manual'` — every caller except
 * `getOrCreatePairGroup` wants that, so only it ever passes `'autoPair'`
 * (and, alongside it, `pairUids`).
 */
export async function createGroup(
  name: string,
  uid: string,
  email: string,
  kind: 'manual' | 'autoPair' = 'manual',
  pairUids?: [string, string],
): Promise<string> {
  const groupRef = await addDoc(collection(db, 'groups'), {
    name,
    createdBy: uid,
    createdAt: Date.now(),
    kind,
    ...(pairUids ? { pairUids } : {}),
  })
  await setDoc(doc(db, 'groups', groupRef.id, 'members', uid), {
    uid,
    joinedAt: Date.now(),
    email,
  })
  return groupRef.id
}

/** A one-time (not live) version of `useGroups()`'s own collection-group query — for use inside an action handler (e.g. `getOrCreatePairGroup`) rather than a component render. */
export async function fetchMyGroupIds(uid: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(collectionGroup(db, 'members'), where('uid', '==', uid)),
  )
  return snapshot.docs
    .map((memberDoc) => memberDoc.ref.parent.parent?.id)
    .filter((id): id is string => !!id)
}

/** Every `autoPair` group among the caller's own groups whose `pairUids` matches this exact pair — normally at most one, but the caller-side scan (not a unique-constrained lookup) can't guarantee that, so callers should treat this as "every group to treat as *the* pair group," not assume a single result. */
async function findPairGroupIds(myUid: string, peerUid: string): Promise<string[]> {
  const pairUids: [string, string] = [myUid, peerUid].sort() as [string, string]
  const groupIds = await fetchMyGroupIds(myUid)

  const matches: string[] = []
  for (const groupId of groupIds) {
    const groupSnapshot = await getDoc(doc(db, 'groups', groupId))
    const data = groupSnapshot.data()
    if (data?.kind === 'autoPair' && data.pairUids?.[0] === pairUids[0] && data.pairUids?.[1] === pairUids[1]) {
      matches.push(groupId)
    }
  }
  return matches
}

/**
 * Finds (or, failing that, silently creates) the hidden 1:1 group backing
 * "share directly with a connection" — never surfaced as a group anywhere
 * in the UI (see `GroupDocument.kind`'s doc comment). Reuse is checked via
 * each of the caller's own `autoPair` groups' own `pairUids` field, rather
 * than reading its `members` subcollection — at most a handful of groups
 * for any real account, so this linear scan is cheap. No new Firestore rule
 * is needed for any of it: this account can already read its own groups
 * (`fetchMyGroupIds`), and create a group / add one of its own connections
 * as a member (both already-existing rules `createGroup`/`addMemberToGroup`
 * rely on).
 */
export async function getOrCreatePairGroup(
  myUid: string,
  myEmail: string,
  peerUid: string,
  peerEmail: string,
): Promise<string> {
  const [existingGroupId] = await findPairGroupIds(myUid, peerUid)
  if (existingGroupId) return existingGroupId

  const pairUids: [string, string] = [myUid, peerUid].sort() as [string, string]
  const name = [myEmail, peerEmail].sort().join(' & ')
  const groupId = await createGroup(name, myUid, myEmail, 'autoPair', pairUids)
  await addMemberToGroup(groupId, peerUid, peerEmail)
  return groupId
}

/**
 * Called when disconnecting from a peer: leaves (self-removal only, per
 * firestore.rules — this account was never necessarily the creator) every
 * hidden `autoPair` group shared with them, and clears `sharedWith` on any
 * of the caller's own foods/recipes still pointing at one of those groups,
 * so nothing is left silently "shared" with a group this account can no
 * longer even read once it's not a member. Only touches the caller's own
 * data: the peer's own foods/recipes and group membership aren't writable
 * from here, so this app being client-only (no Cloud Functions) means full
 * two-sided cleanup isn't possible — the peer sees the same thing on their
 * own next disconnect-from-you, if they ever do one.
 */
export async function leavePairGroupsWith(myUid: string, peerUid: string): Promise<void> {
  const pairGroupIds = await findPairGroupIds(myUid, peerUid)
  if (pairGroupIds.length === 0) return

  const batch = writeBatch(db)
  for (const groupId of pairGroupIds) {
    batch.delete(doc(db, 'groups', groupId, 'members', myUid))
  }

  for (const subcollection of ['foods', 'recipes'] as const) {
    const snapshot = await getDocs(
      query(collection(db, 'users', myUid, subcollection), where('sharedWith', 'in', pairGroupIds)),
    )
    for (const itemDoc of snapshot.docs) {
      batch.update(itemDoc.ref, { sharedWith: deleteField() })
    }
  }

  await batch.commit()
}

export async function renameGroup(groupId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { name })
}

/** Every member's uid, for `lib/pendingEdits.ts`'s `requiredApprovers` snapshot (every OTHER member at propose time) — a one-off fetch, not a live subscription, since it's only ever read once per proposal. */
export async function fetchGroupMemberUids(groupId: string): Promise<string[]> {
  const snapshot = await getDocs(collection(db, 'groups', groupId, 'members'))
  return snapshot.docs.map((memberDoc) => memberDoc.id)
}

/** Adds one of the caller's own connections to a group they're already in — immediate, no acceptance step from the person being added (see firestore.rules). */
export async function addMemberToGroup(
  groupId: string,
  memberUid: string,
  memberEmail: string,
): Promise<void> {
  await setDoc(doc(db, 'groups', groupId, 'members', memberUid), {
    uid: memberUid,
    joinedAt: Date.now(),
    email: memberEmail,
  })
}

/** Leaving (self) or being removed (by the group's creator) — same rule either way. */
export async function removeMemberFromGroup(
  groupId: string,
  memberUid: string,
): Promise<void> {
  await deleteDoc(doc(db, 'groups', groupId, 'members', memberUid))
}

/**
 * Deletes a group and everything under it. Firestore doesn't cascade-delete
 * subcollections on its own, so this fetches every member and inventory
 * batch first and removes them alongside the group doc in one batch —
 * fine at household scale (well under the 500-write batch limit); a larger
 * group would need chunking, not attempted here.
 */
export async function deleteGroup(groupId: string): Promise<void> {
  const [membersSnapshot, inventorySnapshot] = await Promise.all([
    getDocs(collection(db, 'groups', groupId, 'members')),
    getDocs(collection(db, 'groups', groupId, 'inventory')),
  ])

  const batch = writeBatch(db)
  for (const memberDoc of membersSnapshot.docs) batch.delete(memberDoc.ref)
  for (const batchDoc of inventorySnapshot.docs) batch.delete(batchDoc.ref)
  batch.delete(doc(db, 'groups', groupId))
  await batch.commit()
}
