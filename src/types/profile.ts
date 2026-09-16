/**
 * `users/{uid}/profile/public` — a small, separately-readable mirror of the
 * account's username, distinct from the owner-only `settings/preferences`
 * doc. Readable by any signed-in user (see firestore.rules) — the same
 * openness as `connectCodes`'s `get` rule, since a username is already
 * effectively shared with anyone holding this account's connect code.
 * Written only by `lib/profile.ts`'s `setUsername`, never directly, so it
 * can never drift out of sync with `UserSettings.username`.
 */
export type PublicProfileDocument = {
  username: string
  usernameUpdatedAt: number
}
