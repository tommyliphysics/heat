import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.ts'
import type { GroupMemberListItem } from '../types/groups.ts'

export function useGroupMembers(groupId: string | undefined): {
  members: GroupMemberListItem[]
  loaded: boolean
} {
  const [members, setMembers] = useState<GroupMemberListItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!groupId) return
    setLoaded(false)

    return onSnapshot(
      collection(db, 'groups', groupId, 'members'),
      (snapshot) => {
        setMembers(
          snapshot.docs
            .map((memberDoc) => memberDoc.data() as GroupMemberListItem)
            .sort((a, b) => a.email.localeCompare(b.email)),
        )
        setLoaded(true)
      },
      // Expected once this account leaves the group (or the group is
      // deleted) while GroupDetailPage is still mounted — every gated page
      // stays mounted for the life of the session (see PageRegistry.tsx),
      // so this listener has no unmount to tear it down on. Firestore
      // itself logs the raw error to the console if there's no error
      // callback at all; resetting to empty here is the graceful outcome,
      // not a bug to surface.
      () => {
        setMembers([])
        setLoaded(true)
      },
    )
  }, [groupId])

  return { members, loaded }
}
