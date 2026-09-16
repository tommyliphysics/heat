import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../firebase.ts'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.tsx'
import Icon from '../components/Icon.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { useConnections } from '../hooks/useConnections.ts'
import { useGroupCharges } from '../hooks/useGroupCharges.ts'
import { useGroupMembers } from '../hooks/useGroupMembers.ts'
import { useGroupPendingEdits } from '../hooks/useGroupPendingEdits.ts'
import { useGroups } from '../hooks/useGroups.ts'
import { useRouteParam } from '../hooks/useRouteParam.ts'
import { useSharedInventoryProposal } from '../hooks/useSharedInventoryProposal.ts'
import { respondToCharge } from '../lib/charges.ts'
import { connectionDisplayName } from '../lib/connect.ts'
import {
  addMemberToGroup,
  deleteGroup,
  removeMemberFromGroup,
  renameGroup,
} from '../lib/groups.ts'
import { respondToPendingEdit } from '../lib/pendingEdits.ts'
import {
  proposeSharedInventory,
  respondToSharedInventoryProposal,
} from '../lib/sharedInventoryProposal.ts'
import { describeSharedItemDiff } from '../lib/sharedItems.ts'

function GroupDetailPage() {
  const groupId = useRouteParam('/groups/:groupId', 'groupId')
  const navigate = useNavigate()
  const { groups, loaded: groupsLoaded } = useGroups()
  const { members, loaded: membersLoaded } = useGroupMembers(groupId)
  const { connections } = useConnections()
  const { pendingEdits } = useGroupPendingEdits(groupId)
  const { charges } = useGroupCharges(groupId)
  const { proposal: inventoryProposal } = useSharedInventoryProposal(groupId)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [addingUid, setAddingUid] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [error, setError] = useState('')

  const group = groups.find((g) => g.id === groupId) ?? null
  const uid = auth.currentUser?.uid
  const isCreator = !!group && group.createdBy === uid
  const memberUids = new Set(members.map((m) => m.uid))
  const addableConnections = connections.filter((c) => !memberUids.has(c.peerUid))
  const emailByUid = new Map(members.map((m) => [m.uid, m.email]))

  const editsAwaitingMyVote = pendingEdits.filter(
    (edit) =>
      edit.status === 'pending' &&
      uid !== undefined &&
      edit.requiredApprovers.includes(uid) &&
      !edit.approvals[uid],
  )
  const myOutstandingEdits = pendingEdits.filter(
    (edit) => edit.foodOwnerUid === uid && edit.status !== 'done' && edit.status !== 'rejected',
  )
  const chargesAwaitingMyResponse = charges.filter(
    (charge) => uid !== undefined && charge.charges[uid]?.status === 'pending',
  )
  const inventoryProposalAwaitingMyVote =
    !!inventoryProposal &&
    uid !== undefined &&
    inventoryProposal.requiredApprovers.includes(uid) &&
    !inventoryProposal.approvals[uid]
  const myOutstandingInventoryProposal =
    inventoryProposal && inventoryProposal.proposedBy === uid ? inventoryProposal : null

  async function handleRespondToEdit(editId: string, response: 'approved' | 'rejected') {
    if (!groupId || !uid) return
    await respondToPendingEdit(groupId, editId, uid, response)
  }

  async function handleRespondToCharge(chargeId: string, response: 'accepted' | 'rejected') {
    if (!groupId || !uid) return
    await respondToCharge(groupId, chargeId, uid, response)
  }

  async function handleProposeSharedInventory() {
    if (!groupId || !uid) return
    await proposeSharedInventory(groupId, uid)
  }

  async function handleRespondToInventoryProposal(response: 'approved' | 'rejected') {
    if (!groupId || !uid) return
    await respondToSharedInventoryProposal(groupId, uid, response)
  }

  function startRename() {
    if (!group) return
    setNameDraft(group.name)
    setEditingName(true)
  }

  async function handleRename() {
    if (!groupId || !nameDraft.trim()) return
    await renameGroup(groupId, nameDraft.trim())
    setEditingName(false)
  }

  async function handleAddMember() {
    if (!groupId || !addingUid) return
    const connection = connections.find((c) => c.peerUid === addingUid)
    if (!connection) return

    setError('')
    try {
      await addMemberToGroup(groupId, connection.peerUid, connection.peerEmail)
      setAddingUid('')
    } catch {
      setError('Could not add that connection. Please try again.')
    }
  }

  // Only ever called for the caller's own membership — the app never offers
  // a way to remove anyone else (see firestore.rules' doc comment on why
  // the rule itself still has to allow more than that, for `deleteGroup()`'s
  // sake). Available to every member, creator included — leaving is
  // different from deleting: the group and everyone else's access to it
  // continues, only the caller's own membership ends.
  async function handleLeaveGroup() {
    if (!groupId || !uid) return
    await removeMemberFromGroup(groupId, uid)
    navigate('/network')
  }

  async function handleDeleteGroup() {
    if (!groupId) return
    await deleteGroup(groupId)
    navigate('/network')
  }

  if (!groupsLoaded || !membersLoaded) {
    return (
      <PageLayout header={<h1>Group</h1>}>
        <LoadingIndicator />
      </PageLayout>
    )
  }

  if (!group) {
    return (
      <PageLayout header={<h1>Group</h1>}>
        <p>Group not found.</p>
      </PageLayout>
    )
  }

  return (
    <>
      <PageLayout
        header={
          <>
            <Link to="/network" className="top-link">
              <Icon name="arrow-left" size={13} />
              Network
            </Link>
            <div className="title-row">
              {editingName ? (
                <div className="unit-row">
                  <input
                    type="text"
                    value={nameDraft}
                    autoFocus
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename()
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                  />
                  <button type="button" className="icon-btn" onClick={handleRename}>
                    <Icon name="check" size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <h1>{group.name}</h1>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Rename group"
                    onClick={startRename}
                  >
                    <Icon name="pencil" size={16} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                aria-label="Leave group"
                onClick={() => setLeaveOpen(true)}
              >
                <Icon name="logout" size={16} />
              </button>
              {isCreator && (
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  aria-label="Delete group"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          </>
        }
      >
        <h2 className="form-section-heading">Members</h2>
        {members.map((member) => (
          <div key={member.uid} className="group-member-row">
            <span>{member.email}</span>
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => setLeaveOpen(true)}>
          <Icon name="logout" size={16} />
          Exit Group
        </button>

        <h2 className="form-section-heading">Shared Inventory</h2>
        {group.sharedInventoryEnabled ? (
          <p>Shared inventory is on for this group.</p>
        ) : inventoryProposalAwaitingMyVote ? (
          <div className="group-member-row">
            <span>
              {emailByUid.get(inventoryProposal!.proposedBy) ?? 'A member'} wants
              to turn on shared inventory for this group.
            </span>
            <div className="confirm-delete-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleRespondToInventoryProposal('rejected')}
              >
                Reject
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleRespondToInventoryProposal('approved')}
              >
                Approve
              </button>
            </div>
          </div>
        ) : myOutstandingInventoryProposal ? (
          <p>
            Waiting on:{' '}
            {myOutstandingInventoryProposal.requiredApprovers
              .filter((approverUid) => myOutstandingInventoryProposal.approvals[approverUid] !== 'approved')
              .map((u) => emailByUid.get(u) ?? u)
              .join(', ')}
          </p>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={handleProposeSharedInventory}>
            Propose Enabling Shared Inventory
          </button>
        )}

        {editsAwaitingMyVote.length > 0 && (
          <>
            <h2 className="form-section-heading">Pending Changes</h2>
            {editsAwaitingMyVote.map((edit) => (
              <div key={edit.id} className="foods-table-wrap">
                <p>
                  {emailByUid.get(edit.foodOwnerUid) ?? 'A member'} wants to
                  change {edit.itemName}:
                </p>
                <table className="foods-table">
                  <thead>
                    <tr>
                      <th aria-hidden="true" />
                      <th>Current</th>
                      <th>Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {describeSharedItemDiff(edit.previousFields, edit.proposedFields).map(
                      (row) => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td className="cell-mono">{row.mine}</td>
                          <td className="cell-mono">{row.theirs}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                <div className="confirm-delete-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleRespondToEdit(edit.id, 'rejected')}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleRespondToEdit(edit.id, 'approved')}
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {myOutstandingEdits.length > 0 && (
          <>
            <h2 className="form-section-heading">Your Pending Changes</h2>
            {myOutstandingEdits.map((edit) => {
              const outstanding = edit.requiredApprovers.filter(
                (approverUid) => edit.approvals[approverUid] !== 'approved',
              )
              return (
                <p key={edit.id}>
                  {edit.itemName}: waiting on{' '}
                  {outstanding.map((u) => emailByUid.get(u) ?? u).join(', ')}
                </p>
              )
            })}
          </>
        )}

        {chargesAwaitingMyResponse.length > 0 && (
          <>
            <h2 className="form-section-heading">Charges</h2>
            {chargesAwaitingMyResponse.map((charge) => {
              const mine = uid ? charge.charges[uid] : undefined
              if (!mine) return null
              return (
                <div key={charge.id} className="group-member-row">
                  <span>
                    {emailByUid.get(charge.proposerUid) ?? 'A member'} is
                    charging you {mine.currency} {mine.amount} for{' '}
                    {charge.foodName}
                  </span>
                  <div className="confirm-delete-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleRespondToCharge(charge.id, 'rejected')}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleRespondToCharge(charge.id, 'accepted')}
                    >
                      Accept
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {addableConnections.length > 0 && (
          <>
            <h2 className="form-section-heading">Add a Connection</h2>
            <div className="unit-row">
              <select
                aria-label="Connection to add"
                value={addingUid}
                onChange={(e) => setAddingUid(e.target.value)}
              >
                <option value="">Choose a connection...</option>
                {addableConnections.map((c) => (
                  <option key={c.peerUid} value={c.peerUid}>
                    {connectionDisplayName(c)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!addingUid}
                onClick={handleAddMember}
              >
                Add
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </>
        )}
      </PageLayout>

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteGroup}
        title="Delete Group?"
        message={`This will permanently delete "${group.name}" and its shared inventory for everyone. This can't be undone.`}
      />

      <ConfirmDeleteModal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={handleLeaveGroup}
        title="Leave Group?"
        message={`You'll lose access to "${group.name}"'s shared foods, recipes, and inventory. The group and everyone else in it are unaffected — you can only rejoin if someone adds you back.`}
        confirmLabel="Leave"
        confirmingLabel="Leaving..."
        errorMessage="Could not leave the group. Please try again."
      />
    </>
  )
}

export default GroupDetailPage
