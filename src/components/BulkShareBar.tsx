import { useState } from 'react'
import { connectionDisplayName } from '../lib/connect.ts'
import type { ConnectionListItem } from '../types/connections.ts'
import type { GroupListItem } from '../types/groups.ts'

export type BulkShareTarget =
  | { type: 'group'; groupId: string }
  | { type: 'connection'; peerUid: string }

type BulkShareBarProps = {
  selectedCount: number
  manualGroups: GroupListItem[]
  connections: ConnectionListItem[]
  onShare: (target: BulkShareTarget) => Promise<void>
}

/**
 * The bulk "Share with..." action bar shown once one or more rows are
 * checked, on both the Foods and Recipes pages' own-items tab. Lets the
 * picker mix groups and connections in one list — from the user's own
 * perspective there's no meaningful difference between the two here; a
 * connection just resolves to its hidden pair-group under the hood (see
 * `lib/groups.ts`'s `getOrCreatePairGroup`, called by the caller's
 * `onShare`, not this component). Unlike the existing single-row Share
 * `<select>` elsewhere (which applies instantly), this needs an explicit
 * confirm step since it affects every selected item at once.
 */
function BulkShareBar({
  selectedCount,
  manualGroups,
  connections,
  onShare,
}: BulkShareBarProps) {
  const [target, setTarget] = useState('')
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState('')

  async function handleShare() {
    if (!target) return
    const [type, id] = target.split(':', 2) as ['group' | 'connection', string]

    setError('')
    setSharing(true)
    try {
      await onShare(type === 'group' ? { type: 'group', groupId: id } : { type: 'connection', peerUid: id })
      setTarget('')
    } catch {
      setError('Could not share the selected items. Please try again.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="list-toolbar">
      <span>{selectedCount} selected</span>
      <select
        aria-label="Share selected with"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="">Share with...</option>
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
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={handleShare}
        disabled={!target || sharing}
      >
        {sharing ? 'Sharing...' : 'Share'}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

export default BulkShareBar
