import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { leavePairGroupsWith } from './groups.ts'
import type {
  ConnectCodeDocument,
  ConnectionListItem,
  ConnectionRequestListItem,
} from '../types/connections.ts'

/** The best available label for a connection from the viewer's own side: their private nickname for this person if they set one, else that person's own live username, else the alias frozen at connect time (only relevant for a peer with no `profile/public` doc yet — very old connections), else their email. */
export function connectionDisplayName(connection: ConnectionListItem): string {
  return (
    connection.myAlias ||
    connection.peerUsername ||
    connection.peerAlias ||
    connection.peerEmail
  )
}

/** Whether this connection's peer has changed their username since this account last viewed it (see `markPeerUsernameSeen`). */
export function hasUnseenUsernameChange(connection: ConnectionListItem): boolean {
  return (
    !!connection.peerUsernameUpdatedAt &&
    connection.peerUsernameUpdatedAt > (connection.usernameSeenAt ?? 0)
  )
}

/** Records that this account has now seen the peer's current username, so `hasUnseenUsernameChange` stops flagging it until it changes again. */
export async function markPeerUsernameSeen(
  myUid: string,
  peerUid: string,
  seenAt: number,
): Promise<void> {
  await updateDoc(doc(db, 'users', myUid, 'connections', peerUid), {
    usernameSeenAt: seenAt,
  })
}

/** Not the uid itself — a code is meant to be shared publicly (QR, link), so it deliberately doesn't double as an account identifier the way the old code (a Firestore auto-id with no real structure either, but worth being explicit about) might have implied. Plenty of entropy for something that only needs to resist guessing, not cryptographic attack. */
function randomCode(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/**
 * Creates (or replaces) this account's one permanent connect code. A single
 * atomic batch — new code doc, old code doc gone, `UserSettings.connectCode`
 * repointed — so there's never a moment with two simultaneously-valid codes,
 * or a settings pointer aimed at a code that no longer exists. This is the
 * only way to invalidate a code once it's been shared somewhere it
 * shouldn't have been, since a code otherwise never expires or gets
 * consumed by use (unlike the one-shot codes this replaced).
 */
export async function regenerateConnectCode(
  uid: string,
  email: string,
  username: string,
  previousCode: string | null,
): Promise<{ code: string; url: string }> {
  const code = randomCode()
  const batch = writeBatch(db)
  batch.set(doc(db, 'connectCodes', code), { uid, email, username })
  if (previousCode) batch.delete(doc(db, 'connectCodes', previousCode))
  batch.set(
    doc(db, 'users', uid, 'settings', 'preferences'),
    { connectCode: code },
    { merge: true },
  )
  await batch.commit()

  // The app runs under `HashRouter` (see main.tsx) specifically so it works
  // on static hosts like GitHub Pages, which have no server-side rewrite for
  // a client-side route — a real `/connect/{code}` path 404s there. Routes
  // live after `#/`, and `origin + pathname` (not just `origin`) preserves a
  // GitHub Pages project site's repo subpath (e.g. `/LiftShopCook/`).
  const url = `${window.location.origin}${window.location.pathname}#/connect/${code}`
  return { code, url }
}

/** Looks up a code for the request screen — null if it doesn't exist (e.g. already regenerated away). */
export async function getConnectCodeInfo(
  code: string,
): Promise<ConnectCodeDocument | null> {
  const snapshot = await getDoc(doc(db, 'connectCodes', code))
  if (!snapshot.exists()) return null
  return snapshot.data() as ConnectCodeDocument
}

export type RequestResult = { ok: true } | { ok: false; reason: string }

/**
 * Submits a connection request against someone else's permanent code — does
 * NOT connect anything by itself. The code owner has to explicitly accept
 * it (see `acceptConnectionRequest`) or reject it (`deleteConnectionRequest`)
 * before any `ConnectionDocument` exists. `setDoc` (not `addDoc`), keyed by
 * the requester's own uid, so requesting again after an earlier request was
 * rejected just resubmits over the same slot rather than piling up history.
 *
 * Also writes a mirror doc under the requester's own subtree
 * (`outgoingConnectionRequests`) — the request itself lives entirely under
 * the OWNER's uid, invisible to a plain owned-subtree read, so this mirror
 * is what lets the requester's own client know which owners it has a
 * request outstanding with (see `useOutgoingConnectionRequests`). Always
 * self-authorized (both writes are to paths this account already owns or is
 * explicitly granted), deliberately avoiding a collection-group query.
 */
export async function requestConnection(
  code: string,
  myUid: string,
  myEmail: string,
  myUsername: string,
): Promise<RequestResult> {
  const info = await getConnectCodeInfo(code)
  if (!info) {
    return { ok: false, reason: 'This code is invalid.' }
  }
  if (info.uid === myUid) {
    return { ok: false, reason: "You can't connect with yourself." }
  }

  const requestedAt = Date.now()
  await Promise.all([
    setDoc(doc(db, 'users', info.uid, 'connectionRequests', myUid), {
      code,
      requestedAt,
      requesterEmail: myEmail,
      requesterUsername: myUsername,
    }),
    setDoc(doc(db, 'users', myUid, 'outgoingConnectionRequests', info.uid), {
      requestedAt,
    }),
  ])
  return { ok: true }
}

/**
 * Accepts an incoming request: one batch creates both sides of the
 * connection and deletes the request, so a half-finished acceptance is
 * never left behind. The batch's rule evaluation sees the request doc as it
 * stood before the batch (still existing), so the connection-create rule's
 * `exists()` check on it succeeds even though the same batch also deletes
 * it (see firestore.rules) — same trick the old one-shot code flow used to
 * rely on for its own now-removed expiry check.
 *
 * Both sides get a `peerAlias` this time (the requester's from their
 * request, the owner's from their permanent code) — an improvement over the
 * old flow, where only the redeemer ever ended up with one. Doesn't touch
 * the requester's own `outgoingConnectionRequests` mirror doc — can't,
 * that's their subtree, not this caller's; `useOutgoingConnectionRequests`
 * cleans it up reactively once it notices the real request doc is gone.
 *
 * Deliberately does NOT create a group for this pair — groups are only ever
 * created by an explicit "Create Group" action (see NetworkPage.tsx),
 * never automatically as a side effect of connecting.
 */
export async function acceptConnectionRequest(
  ownerUid: string,
  ownerEmail: string,
  ownerUsername: string,
  request: ConnectionRequestListItem,
): Promise<void> {
  const now = Date.now()
  const batch = writeBatch(db)
  batch.set(doc(db, 'users', request.requesterUid, 'connections', ownerUid), {
    connectedAt: now,
    peerEmail: ownerEmail,
    peerAlias: ownerUsername,
  })
  batch.set(doc(db, 'users', ownerUid, 'connections', request.requesterUid), {
    connectedAt: now,
    peerEmail: request.requesterEmail,
    peerAlias: request.requesterUsername,
  })
  batch.delete(doc(db, 'users', ownerUid, 'connectionRequests', request.requesterUid))
  await batch.commit()
}

/** The owner declining an incoming request — just removes it, nothing created. */
export async function deleteConnectionRequest(
  ownerUid: string,
  requesterUid: string,
): Promise<void> {
  await deleteDoc(doc(db, 'users', ownerUid, 'connectionRequests', requesterUid))
}

/** Clears this account's own `outgoingConnectionRequests` mirror entry for `ownerUid` — used both when the requester cancels outright and (reactively, self-healing) once `useOutgoingConnectionRequests` notices the real request doc is already gone. */
export async function clearOutgoingRequestMirror(
  myUid: string,
  ownerUid: string,
): Promise<void> {
  await deleteDoc(doc(db, 'users', myUid, 'outgoingConnectionRequests', ownerUid))
}

/** The requester cancelling their own outgoing request — removes both the real request doc (their own delete rights over a request they filed) and their local mirror of it. */
export async function cancelOutgoingRequest(
  myUid: string,
  ownerUid: string,
): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, 'users', ownerUid, 'connectionRequests', myUid)),
    clearOutgoingRequestMirror(myUid, ownerUid),
  ])
}

/** Sets, updates, or (given a blank value) clears this account's own private nickname for one of its connections — see `ConnectionAliasDocument`. */
export async function setMyAliasForConnection(
  myUid: string,
  peerUid: string,
  alias: string,
): Promise<void> {
  const trimmed = alias.trim()
  const ref = doc(db, 'users', myUid, 'connectionAliases', peerUid)
  if (trimmed) {
    await setDoc(ref, { alias: trimmed })
  } else {
    await deleteDoc(ref)
  }
}

/** A one-time (not live) version of `useConnections()`'s own peer-uid list — for use inside an action handler (e.g. `requestAccountDeletion`) rather than a component render. */
export async function fetchMyConnectionPeerUids(uid: string): Promise<string[]> {
  const snapshot = await getDocs(collection(db, 'users', uid, 'connections'))
  return snapshot.docs.map((connectionDoc) => connectionDoc.id)
}

/**
 * Removes both sides of a connection at once — either party can call this
 * from their own uid, no proof needed once connected (see firestore.rules).
 * Also leaves any hidden pair-group this account silently shared things
 * with the peer through (see `leavePairGroupsWith`) — otherwise "sharing
 * directly with a connection" would leave the caller still sharing with
 * them under the hood after disconnecting, with no way to see or undo it.
 */
export async function disconnectFromPeer(
  myUid: string,
  peerUid: string,
): Promise<void> {
  await leavePairGroupsWith(myUid, peerUid)

  const batch = writeBatch(db)
  batch.delete(doc(db, 'users', myUid, 'connections', peerUid))
  batch.delete(doc(db, 'users', peerUid, 'connections', myUid))
  await batch.commit()
}
