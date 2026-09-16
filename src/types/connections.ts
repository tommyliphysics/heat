/** One side of a symmetric pair — see `users/{uid}/connections/{peerUid}` in firestore.rules. The other side (`users/{peerUid}/connections/{uid}`) is a separate document with the same shape, written at the same time (both, in one batch, by whichever side accepts the connection request — see `lib/connect.ts`'s `acceptConnectionRequest`). */
export type ConnectionDocument = {
  connectedAt: number
  /** The other party's email, snapshotted at connect time — lets the UI show who this is without a second read of their account. */
  peerEmail: string
  /** The peer's username as it stood at the moment the request was accepted — a fallback only, used when the peer's live `PublicProfileDocument` (`users/{uid}/profile/public`) doesn't exist (e.g. a very old connection made before that concept existed). Everywhere else prefers the live value — see `lib/connect.ts`'s `connectionDisplayName`. */
  peerAlias?: string
  /** This account's own bookmark of the last `PublicProfileDocument.usernameUpdatedAt` it has seen for this peer — written only by the owning account (see `lib/connect.ts`'s `markPeerUsernameSeen`), read back by `hasUnseenUsernameChange` to decide whether to show a "changed their name" marker. */
  usernameSeenAt?: number
}

export type ConnectionListItem = ConnectionDocument & {
  peerUid: string
  /** This account's own private label for `peerUid`, if they set one — merged in by `useConnections` from `ConnectionAliasDocument`, never part of the `ConnectionDocument` itself. */
  myAlias?: string
  /** The peer's current username, merged in live by `useConnections` from their `PublicProfileDocument` — the primary display source ahead of the frozen `peerAlias` fallback. */
  peerUsername?: string
  /** Paired with `peerUsername` — when it was last changed, for `hasUnseenUsernameChange` to compare against `usernameSeenAt`. */
  peerUsernameUpdatedAt?: number
}

/**
 * A user's own permanent connect code — `connectCodes/{code}` (a random id,
 * not the uid, so the code itself doesn't leak the account id). One at a
 * time per account: `UserSettings.connectCode` points at whichever is
 * current. Regenerating (see `lib/connect.ts`'s `regenerateConnectCode`)
 * deletes this doc and creates a brand new one under a new random id — the
 * only way to invalidate a code that's been shared somewhere it shouldn't
 * have been, since the code itself never expires or gets consumed by use.
 */
export type ConnectCodeDocument = {
  uid: string
  email: string
  /** This account's username at generate/regenerate time — not kept live in sync with a later username change (regenerate to update it), and not editable per-code the way the old free-text alias used to be; it's always `UserSettings.username`. Shown to anyone who requests via this code instead of a raw email, and snapshotted onto their new connection as `ConnectionDocument.peerAlias` once accepted. */
  username: string
}

/**
 * A still-open ask to connect, created by `requesterUid` against `uid`'s
 * permanent code (`users/{uid}/connectionRequests/{requesterUid}`) — see
 * `lib/connect.ts`'s `requestConnection`. Existence alone is the pending
 * state; there's no separate status field, since accepting deletes this in
 * the same batch that creates the connection (see `acceptConnectionRequest`)
 * and rejecting or cancelling is just a plain delete with nothing created.
 * `requestConnection` also drops a mirror doc under the requester's own
 * subtree (`OutgoingConnectionRequestDocument`, below) since this doc itself
 * is invisible to a plain owned-subtree read from the requester's side.
 */
export type ConnectionRequestDocument = {
  code: string
  requestedAt: number
  requesterEmail: string
  /** The requester's own username at request time — same idea as `ConnectCodeDocument.username`, just supplied fresh at request time rather than read off a code, since the requester doesn't have one of their own to draw from here. */
  requesterUsername: string
}

export type ConnectionRequestListItem = ConnectionRequestDocument & {
  requesterUid: string
}

/**
 * `users/{myUid}/outgoingConnectionRequests/{ownerUid}` — a lightweight
 * pointer recording that this account has an outstanding request against
 * `ownerUid`'s code, nothing more. Exists purely so the requester's own
 * client can enumerate which owners to check (each via a direct, already-
 * authorized read of `users/{ownerUid}/connectionRequests/{myUid}`) without
 * a collection-group query — see `hooks/useOutgoingConnectionRequests.ts`.
 * Self-healing: cleared by the requester's own client once it notices the
 * real request doc is gone (accepted or declined), via
 * `lib/connect.ts`'s `clearOutgoingRequestMirror`.
 */
export type OutgoingConnectionRequestDocument = {
  requestedAt: number
}

/**
 * A private label an account chose for one of its own connections — e.g.
 * offered when confirming a redeemed connect code (see
 * `RedeemConnectPage.tsx`). Deliberately its own collection
 * (`users/{uid}/connectionAliases/{peerUid}`) rather than a field on
 * `ConnectionDocument` itself: the `connections` collection has a rule
 * granting the *peer* read access to a connection doc that names them (see
 * firestore.rules), which would leak this straight to the very person it's
 * meant to be hidden from — this path has no such rule, so only the
 * blanket owner-only rule ever covers it, and the peer can never read it.
 */
export type ConnectionAliasDocument = {
  alias: string
}
