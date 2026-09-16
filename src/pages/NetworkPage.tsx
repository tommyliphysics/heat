import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import QRCode from 'qrcode'
import { auth } from '../firebase.ts'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.tsx'
import Icon from '../components/Icon.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { useConnectionRequests } from '../hooks/useConnectionRequests.ts'
import { useConnections } from '../hooks/useConnections.ts'
import { useGroups } from '../hooks/useGroups.ts'
import { useOutgoingConnectionRequests } from '../hooks/useOutgoingConnectionRequests.ts'
import {
  acceptConnectionRequest,
  cancelOutgoingRequest,
  connectionDisplayName,
  deleteConnectionRequest,
  disconnectFromPeer,
  hasUnseenUsernameChange,
  markPeerUsernameSeen,
  regenerateConnectCode,
  setMyAliasForConnection,
} from '../lib/connect.ts'
import { createGroup } from '../lib/groups.ts'
import { setUsername as saveUsername } from '../lib/profile.ts'
import { subscribeToUserSettings } from '../lib/settings.ts'
import type { ConnectionListItem } from '../types/connections.ts'

type CodeState = { code: string; url: string; qrDataUrl: string }

function NetworkPage() {
  const location = useLocation()
  const { connections, loaded: connectionsLoaded } = useConnections()
  const { requests: incomingRequests, loaded: incomingLoaded } = useConnectionRequests()
  const { requests: outgoingRequests, loaded: outgoingLoaded } =
    useOutgoingConnectionRequests()
  const { groups, loaded: groupsLoaded } = useGroups()
  // Hidden 1:1 groups auto-created for "share directly with a connection"
  // (see GroupDocument.kind's doc comment) never show up as a group here —
  // this list is purely for groups the user actually made on purpose.
  const manualGroups = groups.filter((group) => group.kind !== 'autoPair')

  const [username, setUsernameState] = useState<string | null>(null)
  const [usernameDraft, setUsernameDraft] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const [savedConnectCode, setSavedConnectCode] = useState<string | null>(null)
  const [codeState, setCodeState] = useState<CodeState | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [disconnectTarget, setDisconnectTarget] = useState<ConnectionListItem | null>(null)
  const [editingPeerUid, setEditingPeerUid] = useState<string | null>(null)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [respondingTo, setRespondingTo] = useState<string | null>(null)

  const [groupName, setGroupName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [groupError, setGroupError] = useState('')

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return subscribeToUserSettings(user.uid, (settings) => {
      setUsernameState(settings.username ?? '')
      setSavedConnectCode(settings.connectCode ?? null)
    })
  }, [])

  // Rebuilds the QR image for whichever code is current — on first load of
  // an existing code, and again whenever `regenerateConnectCode` produces a
  // new one. Not needed for a brand new account with no code yet.
  useEffect(() => {
    if (!savedConnectCode) {
      setCodeState(null)
      return
    }
    if (codeState?.code === savedConnectCode) return

    const url = `${window.location.origin}${window.location.pathname}#/connect/${savedConnectCode}`
    QRCode.toDataURL(url, { width: 260, margin: 1 }).then((qrDataUrl) => {
      setCodeState({ code: savedConnectCode, url, qrDataUrl })
    })
  }, [savedConnectCode, codeState])

  // Marks every currently-flagged "changed their name" connection as seen
  // once the visitor actually navigates away from this page — not on
  // unmount, since every gated page in this app stays permanently mounted
  // (see PageRegistry.tsx) and only ever toggles `hidden`; `location`
  // is global, so this component still re-renders on every navigation, and
  // this effect's cleanup fires exactly when `isActive` flips from true to
  // false. The ref (not the `connections` closed over at mount) keeps this
  // reading whatever was most recently rendered, not a stale first value.
  const isActive = location.pathname === '/network'
  const connectionsRef = useRef(connections)
  connectionsRef.current = connections
  useEffect(() => {
    if (!isActive) return
    return () => {
      const user = auth.currentUser
      if (!user) return
      for (const connection of connectionsRef.current) {
        if (hasUnseenUsernameChange(connection) && connection.peerUsernameUpdatedAt) {
          markPeerUsernameSeen(
            user.uid,
            connection.peerUid,
            connection.peerUsernameUpdatedAt,
          ).catch(() => {})
        }
      }
    }
  }, [isActive])

  async function handleSaveUsername() {
    const user = auth.currentUser
    if (!user || !usernameDraft.trim()) return

    setError('')
    setSavingUsername(true)
    try {
      await saveUsername(user.uid, usernameDraft)
    } catch {
      setError('Could not save your username. Please try again.')
    } finally {
      setSavingUsername(false)
    }
  }

  async function handleGenerate() {
    const user = auth.currentUser
    if (!user?.email || !username) return

    setError('')
    setGenerating(true)
    try {
      await regenerateConnectCode(user.uid, user.email, username, savedConnectCode)
    } catch {
      setError('Could not generate a code. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopyLink() {
    if (!codeState) return
    await navigator.clipboard.writeText(codeState.url)
    setCopied(true)
  }

  async function handleConfirmDisconnect() {
    const user = auth.currentUser
    if (!user || !disconnectTarget) return
    await disconnectFromPeer(user.uid, disconnectTarget.peerUid)
    setDisconnectTarget(null)
  }

  function startEditingNickname(connection: ConnectionListItem) {
    setEditingPeerUid(connection.peerUid)
    setNicknameDraft(connection.myAlias ?? '')
  }

  async function handleSaveNickname(peerUid: string) {
    const user = auth.currentUser
    if (!user) return
    await setMyAliasForConnection(user.uid, peerUid, nicknameDraft)
    setEditingPeerUid(null)
  }

  async function handleAccept(request: (typeof incomingRequests)[number]) {
    const user = auth.currentUser
    if (!user?.email || !username) return
    setRespondingTo(request.requesterUid)
    try {
      await acceptConnectionRequest(user.uid, user.email, username, request)
    } finally {
      setRespondingTo(null)
    }
  }

  async function handleDecline(requesterUid: string) {
    const user = auth.currentUser
    if (!user) return
    setRespondingTo(requesterUid)
    try {
      await deleteConnectionRequest(user.uid, requesterUid)
    } finally {
      setRespondingTo(null)
    }
  }

  async function handleCancelOutgoing(ownerUid: string) {
    const user = auth.currentUser
    if (!user) return
    setRespondingTo(ownerUid)
    try {
      await cancelOutgoingRequest(user.uid, ownerUid)
    } finally {
      setRespondingTo(null)
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault()
    const user = auth.currentUser
    if (!user?.email || !groupName.trim()) return

    setGroupError('')
    setCreatingGroup(true)
    try {
      await createGroup(groupName.trim(), user.uid, user.email)
      setGroupName('')
    } catch {
      setGroupError('Could not create the group. Please try again.')
    } finally {
      setCreatingGroup(false)
    }
  }

  const networkLoaded = connectionsLoaded && incomingLoaded && outgoingLoaded
  const networkEmpty =
    connections.length === 0 && incomingRequests.length === 0 && outgoingRequests.length === 0

  return (
    <PageLayout header={<h1>Network</h1>}>
      <p className="form-hint">
        Connect with a partner, friend, or housemate to share foods and
        recipes, and group up with several people at once to share a synced
        inventory.
      </p>

      {username === '' ? (
        <div className="auth-form">
          <label htmlFor="network-username">Choose a username</label>
          <div className="unit-row">
            <input
              id="network-username"
              type="text"
              value={usernameDraft}
              onChange={(e) => setUsernameDraft(e.target.value)}
              placeholder="e.g. Alex"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveUsername}
              disabled={savingUsername || !usernameDraft.trim()}
            >
              {savingUsername ? 'Saving...' : 'Save Username'}
            </button>
          </div>
          <p className="form-hint">
            Needed before you can connect with anyone — shown to people you
            connect with instead of your account id.
          </p>
        </div>
      ) : username === null ? null : (
        <div className="auth-form">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            <Icon name="users" size={16} />
            {generating
              ? 'Generating...'
              : savedConnectCode
                ? 'Regenerate Code'
                : 'Generate My Code'}
          </button>
          {savedConnectCode && (
            <p className="form-hint">
              Regenerating replaces your code — anyone with the old QR or
              link won't be able to use it anymore.
            </p>
          )}
        </div>
      )}

      {codeState && (
        <div className="connect-code-panel">
          <img
            src={codeState.qrDataUrl}
            alt="QR code to connect profiles"
            width={260}
            height={260}
          />
          <p className="form-hint">Or share this link directly.</p>
          <div className="unit-row">
            <input type="text" readOnly value={codeState.url} />
            <button type="button" className="btn btn-secondary" onClick={handleCopyLink}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <h2 className="form-section-heading">Your Network</h2>
      {!networkLoaded ? (
        <LoadingIndicator />
      ) : networkEmpty ? (
        <p>No connections yet.</p>
      ) : (
        <div className="foods-table-wrap">
          <table className="foods-table">
            <thead>
              <tr>
                <th>Connection</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection) => (
                <tr key={`connected-${connection.peerUid}`}>
                  <td>
                    {editingPeerUid === connection.peerUid ? (
                      <div className="unit-row">
                        <input
                          type="text"
                          aria-label={`Nickname for ${connectionDisplayName(connection)}`}
                          value={nicknameDraft}
                          autoFocus
                          onChange={(e) => setNicknameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNickname(connection.peerUid)
                            if (e.key === 'Escape') setEditingPeerUid(null)
                          }}
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Save nickname"
                          onClick={() => handleSaveNickname(connection.peerUid)}
                        >
                          <Icon name="check" size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        {connectionDisplayName(connection)}
                        {hasUnseenUsernameChange(connection) && (
                          <span className="form-hint"> · changed their name</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="shopping-row-delete">
                    {editingPeerUid !== connection.peerUid && (
                      <>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Edit nickname for ${connectionDisplayName(connection)}`}
                          onClick={() => startEditingNickname(connection)}
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          aria-label={`Disconnect from ${connectionDisplayName(connection)}`}
                          onClick={() => setDisconnectTarget(connection)}
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}

              {incomingRequests.map((request) => (
                <tr key={`incoming-${request.requesterUid}`}>
                  <td>{request.requesterUsername}</td>
                  <td className="shopping-row-delete">
                    <span className="form-hint">Wants to connect</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={respondingTo === request.requesterUid}
                      onClick={() => handleDecline(request.requesterUid)}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={respondingTo === request.requesterUid}
                      onClick={() => handleAccept(request)}
                    >
                      Accept
                    </button>
                  </td>
                </tr>
              ))}

              {outgoingRequests.map((request) => (
                <tr key={`outgoing-${request.ownerUid}`}>
                  <td>{request.ownerUsername}</td>
                  <td className="shopping-row-delete">
                    <span className="form-hint">Waiting for them to accept</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={respondingTo === request.ownerUid}
                      onClick={() => handleCancelOutgoing(request.ownerUid)}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="form-section-heading">Groups</h2>
      <p className="form-hint">
        Share foods, recipes, and a synced inventory with several people at
        once. Creating a group doesn't need anyone else's consent — but
        turning on its shared inventory does, from the group's own page.
      </p>

      <form className="auth-form" onSubmit={handleCreateGroup}>
        <label htmlFor="group-name">New group name</label>
        <div className="unit-row">
          <input
            id="group-name"
            type="text"
            placeholder="e.g. Household"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creatingGroup || !groupName.trim()}
          >
            <Icon name="plus" size={16} />
            {creatingGroup ? 'Creating...' : 'Create'}
          </button>
        </div>
        {groupError && <p className="form-error">{groupError}</p>}
      </form>

      {!groupsLoaded ? (
        <LoadingIndicator />
      ) : manualGroups.length === 0 ? (
        <p>No groups yet.</p>
      ) : (
        <div className="foods-table-wrap">
          <table className="foods-table">
            <thead>
              <tr>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {manualGroups.map((group) => (
                <tr key={group.id}>
                  <td>
                    <Link to={`/groups/${group.id}`}>{group.name}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDeleteModal
        open={!!disconnectTarget}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={handleConfirmDisconnect}
        title="Disconnect?"
        message={
          disconnectTarget
            ? `This will remove your connection with ${connectionDisplayName(disconnectTarget)} and stop sharing anything you shared with them directly. Any manually-created groups you're both in are unaffected — this only undoes the connection and direct sharing between you two.`
            : ''
        }
        confirmLabel="Disconnect"
        confirmingLabel="Disconnecting..."
        errorMessage="Could not disconnect. Please try again."
      />
    </PageLayout>
  )
}

export default NetworkPage
