import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import { clearOutgoingRequestMirror } from '../lib/connect.ts'
import { subscribeToPublicProfiles } from '../lib/profile.ts'
import type { PublicProfileDocument } from '../types/profile.ts'

export type OutgoingRequestItem = {
  ownerUid: string
  ownerUsername: string
  requestedAt: number
}

/**
 * Every connect-code request this account currently has outstanding,
 * derived without any collection-group query — see
 * `OutgoingConnectionRequestDocument`'s doc comment for why. Three layers:
 * this account's own mirror docs (which owners to check), a direct read of
 * the real request doc under each of those owners (already authorized by
 * the existing `connectionRequests` rule), and each owner's live username.
 */
export function useOutgoingConnectionRequests(): {
  requests: OutgoingRequestItem[]
  loaded: boolean
} {
  const [mirrorOwnerUids, setMirrorOwnerUids] = useState<string[] | null>(null)
  const [liveByOwner, setLiveByOwner] = useState<Record<string, number>>({})
  const [profiles, setProfiles] = useState<Record<string, PublicProfileDocument>>({})
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'outgoingConnectionRequests'),
      (snapshot) => {
        setMirrorOwnerUids(snapshot.docs.map((docSnapshot) => docSnapshot.id))
      },
    )
  }, [])

  // A plain sorted string, not the array itself, as the dependency — same
  // reasoning as `useGroups`'s `groupIdsKey` and `useConnections`'s
  // `peerUidsKey`: avoids tearing down and resubscribing every per-owner
  // listener below on every snapshot that doesn't actually change the set.
  const ownerUidsKey = mirrorOwnerUids?.join(',') ?? null

  useEffect(() => {
    const user = auth.currentUser
    if (!user || ownerUidsKey === null) return
    const ownerUids = ownerUidsKey ? ownerUidsKey.split(',') : []

    const unsubscribes = ownerUids.map((ownerUid) =>
      onSnapshot(
        doc(db, 'users', ownerUid, 'connectionRequests', user.uid),
        (snapshot) => {
          const data = snapshot.data()
          if (data) {
            setLiveByOwner((current) => ({ ...current, [ownerUid]: data.requestedAt as number }))
          } else {
            setLiveByOwner((current) => {
              const { [ownerUid]: _removed, ...rest } = current
              return rest
            })
            // Self-heal: the real request is gone (accepted or declined
            // by the owner) but our own mirror still points at it —
            // always safe, this only ever touches our own subtree.
            clearOutgoingRequestMirror(user.uid, ownerUid).catch(() => {})
          }
        },
      ),
    )

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [ownerUidsKey])

  useEffect(() => {
    const ownerUids = ownerUidsKey ? ownerUidsKey.split(',') : []
    if (ownerUids.length === 0) {
      setProfiles({})
      setProfilesLoaded(true)
      return
    }
    setProfilesLoaded(false)
    return subscribeToPublicProfiles(ownerUids, (next) => {
      setProfiles(next)
      setProfilesLoaded(true)
    })
  }, [ownerUidsKey])

  const requests: OutgoingRequestItem[] = Object.entries(liveByOwner).map(
    ([ownerUid, requestedAt]) => ({
      ownerUid,
      ownerUsername: profiles[ownerUid]?.username ?? '',
      requestedAt,
    }),
  )

  return { requests, loaded: mirrorOwnerUids !== null && profilesLoaded }
}
