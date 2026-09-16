import { doc, onSnapshot, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { PublicProfileDocument } from '../types/profile.ts'

/**
 * The only write path for a username, anywhere in the app — keeps the
 * owner-only `settings/preferences` copy (used for the account's own
 * Settings page) and the publicly-readable `profile/public` mirror (used by
 * every connection's live display name) from ever drifting apart. One
 * atomic batch, not two separate writes, so there's never a moment where
 * one exists without the other.
 */
export async function setUsername(uid: string, username: string): Promise<void> {
  const trimmed = username.trim()
  const batch = writeBatch(db)
  batch.set(doc(db, 'users', uid, 'settings', 'preferences'), { username: trimmed }, { merge: true })
  batch.set(
    doc(db, 'users', uid, 'profile', 'public'),
    { username: trimmed, usernameUpdatedAt: Date.now() },
    { merge: true },
  )
  await batch.commit()
}

/**
 * One `onSnapshot` per uid — small, household-scale lists (a person's own
 * connections), same tradeoff `useGroups` already makes with its per-group
 * doc listeners, rather than a collection-group query (this data doesn't
 * even live in one collection to query across — each is a doc under a
 * different account's own subtree).
 */
export function subscribeToPublicProfiles(
  uids: string[],
  callback: (profiles: Record<string, PublicProfileDocument>) => void,
): () => void {
  const profiles: Record<string, PublicProfileDocument> = {}

  const unsubscribes = uids.map((uid) =>
    onSnapshot(doc(db, 'users', uid, 'profile', 'public'), (snapshot) => {
      const data = snapshot.data()
      if (data) {
        profiles[uid] = data as PublicProfileDocument
      } else {
        delete profiles[uid]
      }
      callback({ ...profiles })
    }),
  )

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
}
