import { useEffect, useMemo, useState } from 'react'
import { collectionGroup, doc, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import type { GroupListItem } from '../types/groups.ts'

/** Every group the signed-in user belongs to, kept live. Finds them via a collection-group query over every group's `members` subcollection (see `GroupMemberDocument`'s doc comment for why it's a plain field filter, not a document-id one), then subscribes to each matched group's own doc for its name. */
export function useGroups(): { groups: GroupListItem[]; loaded: boolean } {
  const [groupIds, setGroupIds] = useState<string[] | null>(null)
  const [groups, setGroups] = useState<Record<string, GroupListItem>>({})

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return onSnapshot(
      query(collectionGroup(db, 'members'), where('uid', '==', user.uid)),
      (snapshot) => {
        setGroupIds(
          snapshot.docs
            .map((memberDoc) => memberDoc.ref.parent.parent?.id)
            .filter((id): id is string => !!id),
        )
      },
    )
  }, [])

  // A plain string, not the `groupIds` array itself, as the second effect's
  // dependency — `setGroupIds` above hands back a freshly-built array on
  // every snapshot even when its contents haven't actually changed, which
  // would otherwise tear down and resubscribe every group doc listener on
  // every unrelated re-render.
  const groupIdsKey = groupIds?.join(',') ?? null

  useEffect(() => {
    if (groupIdsKey === null) return
    const ids = groupIdsKey ? groupIdsKey.split(',') : []

    const unsubscribes = ids.map((groupId) => {
      const dropGroup = () =>
        setGroups((current) => {
          const { [groupId]: _removed, ...rest } = current
          return rest
        })

      return onSnapshot(
        doc(db, 'groups', groupId),
        (snapshot) => {
          if (!snapshot.exists()) {
            dropGroup()
            return
          }
          setGroups((current) => ({
            ...current,
            [groupId]: { id: groupId, ...snapshot.data() } as GroupListItem,
          }))
        },
        // Expected right after this account leaves `groupId` — the
        // top-level `members` listener above hasn't dropped it from
        // `groupIds` yet, so this per-group listener is still subscribed
        // for one more tick and gets a permission-denied from the backend.
        // Without an error callback, Firestore logs that raw error to the
        // console itself.
        dropGroup,
      )
    })

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [groupIdsKey])

  const groupsList = useMemo(() => {
    const activeIds = new Set(groupIds ?? [])
    return Object.values(groups)
      .filter((group) => activeIds.has(group.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [groups, groupIds])

  return { groups: groupsList, loaded: groupIds !== null }
}
