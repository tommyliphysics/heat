import type { BulkShareTarget } from './BulkShareBar.tsx'
import { connectionDisplayName } from '../lib/connect.ts'
import type { ConnectionListItem } from '../types/connections.ts'
import type { GroupListItem } from '../types/groups.ts'

type ShareTargetSelectProps = {
  ariaLabel: string
  groups: GroupListItem[]
  connections: ConnectionListItem[]
  myUid: string
  sharedWith: string | null | undefined
  onChange: (target: BulkShareTarget | null) => void
}

/**
 * The per-row "Share with..." control on the My Foods/My Recipes tabs.
 * Options mix manual groups and connections in one list, same as
 * `BulkShareBar` — a connection sharing directly resolves to its hidden
 * pair-group under the hood (`lib/groups.ts`'s `getOrCreatePairGroup`,
 * called by the caller's `onChange`, not here). When the row is already
 * shared via one of those hidden pair-groups, this resolves it back to the
 * connection's own name via `GroupDocument.pairUids` — the group's actual
 * `name` (e.g. two emails joined by " & ") is never shown here.
 */
function ShareTargetSelect({
  ariaLabel,
  groups,
  connections,
  myUid,
  sharedWith,
  onChange,
}: ShareTargetSelectProps) {
  const manualGroups = groups.filter((group) => group.kind !== 'autoPair')

  const peerUidByPairGroupId = new Map(
    groups
      .filter((group): group is GroupListItem & { pairUids: [string, string] } =>
        group.kind === 'autoPair' && !!group.pairUids,
      )
      .map((group) => [group.id, group.pairUids.find((uid) => uid !== myUid) ?? group.pairUids[0]]),
  )

  const value = !sharedWith
    ? ''
    : peerUidByPairGroupId.has(sharedWith)
      ? `connection:${peerUidByPairGroupId.get(sharedWith)}`
      : `group:${sharedWith}`

  function handleChange(raw: string) {
    if (!raw) {
      onChange(null)
      return
    }
    const [type, id] = raw.split(':', 2) as ['group' | 'connection', string]
    onChange(type === 'group' ? { type: 'group', groupId: id } : { type: 'connection', peerUid: id })
  }

  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => handleChange(e.target.value)}>
      <option value="">Private</option>
      {manualGroups.length > 0 && (
        <optgroup label="Groups">
          {manualGroups.map((group) => (
            <option key={group.id} value={`group:${group.id}`}>
              {group.name}
            </option>
          ))}
        </optgroup>
      )}
      {connections.length > 0 && (
        <optgroup label="Connections">
          {connections.map((connection) => (
            <option key={connection.peerUid} value={`connection:${connection.peerUid}`}>
              {connectionDisplayName(connection)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

export default ShareTargetSelect
