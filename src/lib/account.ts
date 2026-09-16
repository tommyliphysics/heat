import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type User,
} from 'firebase/auth'
import { googleProvider } from '../firebase.ts'
import { disconnectFromPeer, fetchMyConnectionPeerUids } from './connect.ts'
import { fetchMyGroupIds, removeMemberFromGroup } from './groups.ts'
import { updateUserSettings } from './settings.ts'

export function hasPasswordProvider(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'password')
}

export function hasGoogleProvider(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'google.com')
}

/** Re-proves identity before a sensitive change (email/password/unlink) — via the account's own password if it has one, else a fresh Google sign-in. */
export async function reauthenticate(
  user: User,
  password: string,
): Promise<void> {
  if (hasPasswordProvider(user)) {
    if (!user.email) throw new Error('Account has no email on file')
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, password),
    )
  } else {
    await reauthenticateWithPopup(user, googleProvider)
  }
}

/**
 * Marks the account for deletion — doesn't erase anything itself. This app
 * is client-only (no Cloud Functions), so actually deleting the account and
 * its data is handled by a separate out-of-band job that reviews accounts
 * with this flag set; this only records the request and when it was made.
 *
 * Before that, it exits every group and connection this account has, so
 * remaining members/connections aren't left sharing with an account that's
 * about to disappear. Each group is left the exact same way the "Exit
 * Group" button does (a plain self-removal from `members`) — indistinguishable
 * to everyone else from a normal voluntary leave, which is deliberate: other
 * accounts should see that this person exited, never that the account was
 * deleted. `disconnectFromPeer` already does the equivalent for connections
 * (including leaving any hidden pair-group with that peer).
 */
export async function requestAccountDeletion(uid: string): Promise<void> {
  const [groupIds, peerUids] = await Promise.all([
    fetchMyGroupIds(uid),
    fetchMyConnectionPeerUids(uid),
  ])

  await Promise.all([
    ...groupIds.map((groupId) => removeMemberFromGroup(groupId, uid)),
    ...peerUids.map((peerUid) => disconnectFromPeer(uid, peerUid)),
  ])

  await updateUserSettings(uid, { deletionRequestedAt: Date.now() })
}
