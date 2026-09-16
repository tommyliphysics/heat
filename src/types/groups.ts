import type { EnergyUnit, FoodDocument, MicronutrientUnit, QuantityUnit } from './food.ts'

/** A named set of connections that foods, recipes, and inventory can be shared with all at once — see `groups/{groupId}` in firestore.rules. */
export type GroupDocument = {
  name: string
  createdBy: string
  createdAt: number
  /** Whether this group's shared inventory is actually usable yet — absent/false until every member has unanimously approved a `SharedInventoryProposalDocument` (see `lib/sharedInventoryProposal.ts`). Creating the group itself needs no such consent; only turning this on does. `InventoryPage.tsx` only renders a group's `GroupInventorySection` once this is true. */
  sharedInventoryEnabled?: boolean
  /** Absent or `'manual'`: a real group, made via "Create Group" and shown everywhere groups are listed. `'autoPair'`: a hidden 1:1 group silently got-or-created the first time the user shared something directly with a connection (see `lib/groups.ts`'s `getOrCreatePairGroup`) — never rendered as a group anywhere in the UI, purely a `sharedWith` target under the hood. */
  kind?: 'manual' | 'autoPair'
  /** Set only when `kind === 'autoPair'`: the pair's two uids, sorted so lookup doesn't care which side is "mine". Lets any UI that needs to show an autoPair share resolve it back to "the other person" (via `ConnectionListItem.peerUid`) instead of ever rendering this group's own `name`. */
  pairUids?: [string, string]
}

export type GroupListItem = GroupDocument & { id: string }

/** Doc existence at `groups/{groupId}/members/{uid}` IS membership — the `uid` field is a deliberate denormalization of the doc's own id, needed so `useGroups` can query the `members` collection group by a plain equality filter (`where('uid', '==', myUid)`) rather than by document id, which would need a collection-group index Firestore doesn't auto-create. */
export type GroupMemberDocument = {
  uid: string
  joinedAt: number
  /** Snapshotted at join time so member lists can render without a second read per member. */
  email: string
}

export type GroupMemberListItem = GroupMemberDocument

/** The nutrition/price fields a group's shared item and a pending edit's proposed changes both carry — everything about a food that matters for group-inventory identity and cost math, minus `name`/`brand` (the matching key itself, locked once established — see `SharedItemDocument`'s doc comment) and `servingSize` (cosmetic only, never affects any shared computation). */
export type SharedItemFields = {
  quantity: { amount: string; unit: QuantityUnit }
  energy: { amount: string; unit: EnergyUnit }
  macronutrients: {
    carbs: { amount: string; unit: 'g' }
    fat: { amount: string; unit: 'g' }
    protein: { amount: string; unit: 'g' }
  }
  micronutrients: Record<string, { amount: string; unit: MicronutrientUnit }>
  price: { amount: string; currency: string }
}

/**
 * The group's agreed-upon nutrition/price for one shared food, keyed by
 * `normalizedFoodKey(name, brand)` (`lib/food.ts`) at
 * `groups/{groupId}/sharedItems/{key}`. Established the first time anyone
 * adds that (name, brand) to the group's inventory (see
 * `lib/sharedItems.ts`), seeded from their own food record; from then on
 * it only ever changes via a fully-approved `PendingEditDocument` — never a
 * direct edit, even by whoever established it. `name`/`brand` are locked
 * once this exists: renaming would mean migrating this doc's own key *and*
 * every historical group inventory batch's `foodName`/`brand` (the same
 * fields cross-member consumption matching relies on), which is real
 * migration work, not a small addition — out of scope for now.
 */
export type SharedItemDocument = SharedItemFields & {
  name: string
  brand?: string
  establishedBy: string
  establishedAt: number
}

export type SharedItemListItem = SharedItemDocument & { id: string }

/**
 * A proposed change to a food that backs an established `SharedItemDocument`
 * — see `lib/pendingEdits.ts` for the full propose/approve/apply sequence.
 *
 * `proposedDocument` is the food's *entire* new field set (everything
 * `buildFoodDocument` produces, minus `name`/`brand`, which the edit form
 * locks outright while gated so they can never be part of a proposal) —
 * not just the tracked nutrition/price subset. Holding the whole document
 * pending, rather than only the tracked fields, is what keeps a change to
 * `prices` (the per-retailer history, itself untracked/ungated) from
 * silently reaching the food doc ahead of approval just because it rides
 * along with a gated nutrition/price edit in the same save. On full
 * approval this whole object is written to the food doc in one update;
 * separately, `proposedFields`/`previousFields` (the tracked
 * `SharedItemFields` subset only) are what gets diffed for the approval UI
 * and written to `sharedItems` — `previousFields` snapshots the *current
 * `sharedItems` doc* at propose time (not the proposer's own food doc,
 * which may already be stale from an earlier, not-yet-applied approval),
 * so a diff always reads correctly regardless of how many proposals are in
 * flight.
 *
 * `requiredApprovers` is a snapshot of every OTHER member's uid taken when
 * the edit was proposed, not recomputed live, so someone joining or
 * leaving mid-review never moves the unanimity bar.
 */
export type PendingEditDocument = {
  foodOwnerUid: string
  foodId: string
  itemKey: string
  /** The food's actual display name, captured at propose time — `itemKey` is normalized (trimmed, lowercased) for matching purposes and isn't fit to show a person. */
  itemName: string
  proposedDocument: Partial<FoodDocument>
  proposedFields: SharedItemFields
  previousFields: SharedItemFields
  requiredApprovers: string[]
  approvals: Record<string, 'approved' | 'rejected'>
  status: 'pending' | 'rejected' | 'canonicalApplied' | 'done'
  createdAt: number
}

export type PendingEditListItem = PendingEditDocument & { id: string }

/**
 * An optional charge a purchaser can raise against other members after
 * adding a batch to the group's shared inventory — each named member
 * accepts or rejects independently, writing only their own `charges.{uid}`
 * entry. No running balance is kept, deliberately: this is a per-purchase
 * record, not a settlement ledger. `batchId` is kept for display context
 * only — if that batch is later deleted, the charge stays as a historical
 * record (render "batch deleted" gracefully) rather than being cleaned up,
 * the same way `InventoryBatchDocument.foodName` already outlives a
 * renamed/deleted food elsewhere in this app.
 */
export type ChargeDocument = {
  batchId: string
  foodName: string
  proposerUid: string
  createdAt: number
  charges: Record<string, { amount: string; currency: string; status: 'pending' | 'accepted' | 'rejected' }>
}

export type ChargeListItem = ChargeDocument & { id: string }

/**
 * A singleton at `groups/{groupId}/sharedInventoryProposal/current` —
 * whether this group's shared inventory should turn on, awaiting unanimous
 * approval. See `lib/sharedInventoryProposal.ts` for the propose/approve/
 * apply sequence, which is single-hop unlike `PendingEditDocument`'s: there
 * is no single owning account for a group-level flag the way a food doc has
 * one, so once every required approver has approved, any member's client
 * can flip `GroupDocument.sharedInventoryEnabled` directly and remove this
 * doc — the group doc's own `update` rule already permits any member to
 * write it. A single rejection is terminal for this proposal (the doc is
 * removed, not left around with a 'rejected' status); a new proposal can
 * always be raised again later.
 */
export type SharedInventoryProposalDocument = {
  proposedBy: string
  requiredApprovers: string[]
  approvals: Record<string, 'approved' | 'rejected'>
  createdAt: number
}
