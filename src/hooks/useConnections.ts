import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import { connectionDisplayName } from '../lib/connect.ts'
import { subscribeToPublicProfiles } from '../lib/profile.ts'
import type { ConnectionDocument, ConnectionListItem } from '../types/connections.ts'
import type { PublicProfileDocument } from '../types/profile.ts'

export function useConnections(): {
  connections: ConnectionListItem[]
  loaded: boolean
} {
  const [connections, setConnections] = useState<
    (ConnectionDocument & { peerUid: string })[]
  >([])
  const [connectionsLoaded, setConnectionsLoaded] = useState(false)
  // This account's own private nicknames for its connections (see
  // `ConnectionAliasDocument`) — a separate collection, subscribed to and
  // merged in here, so every screen that lists connections shows the same
  // best-available name without each having to know this collection exists.
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [aliasesLoaded, setAliasesLoaded] = useState(false)
  // Each peer's own live username (see `PublicProfileDocument`) — merged in
  // the same way, so `connectionDisplayName` can prefer a current value over
  // the frozen `peerAlias` snapshot.
  const [profiles, setProfiles] = useState<Record<string, PublicProfileDocument>>({})
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'connections'),
      (snapshot) => {
        setConnections(
          snapshot.docs.map(
            (docSnapshot) =>
              ({
                peerUid: docSnapshot.id,
                ...docSnapshot.data(),
              }) as ConnectionDocument & { peerUid: string },
          ),
        )
        setConnectionsLoaded(true)
      },
    )
  }, [])

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'connectionAliases'),
      (snapshot) => {
        setAliases(
          Object.fromEntries(
            snapshot.docs.map((docSnapshot) => [
              docSnapshot.id,
              (docSnapshot.data().alias as string) ?? '',
            ]),
          ),
        )
        setAliasesLoaded(true)
      },
    )
  }, [])

  // A plain sorted string, not the `connections` array itself, as the
  // dependency — `setConnections` above hands back a freshly-built array on
  // every snapshot even when the set of peer uids hasn't actually changed,
  // which would otherwise tear down and resubscribe every profile listener
  // on every unrelated connection-doc update (same reasoning as `useGroups`'s
  // `groupIdsKey`).
  const peerUidsKey = connections
    .map((c) => c.peerUid)
    .sort()
    .join(',')

  useEffect(() => {
    const uids = peerUidsKey ? peerUidsKey.split(',') : []
    if (uids.length === 0) {
      setProfiles({})
      setProfilesLoaded(true)
      return
    }
    setProfilesLoaded(false)
    return subscribeToPublicProfiles(uids, (next) => {
      setProfiles(next)
      setProfilesLoaded(true)
    })
  }, [peerUidsKey])

  const merged = useMemo(() => {
    const withAliases: ConnectionListItem[] = connections.map((connection) => ({
      ...connection,
      myAlias: aliases[connection.peerUid],
      peerUsername: profiles[connection.peerUid]?.username,
      peerUsernameUpdatedAt: profiles[connection.peerUid]?.usernameUpdatedAt,
    }))
    return withAliases.sort((a, b) =>
      connectionDisplayName(a).localeCompare(connectionDisplayName(b)),
    )
  }, [connections, aliases, profiles])

  return {
    connections: merged,
    loaded: connectionsLoaded && aliasesLoaded && profilesLoaded,
  }
}
