import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase.ts'
import { detectDateFormat } from './timeline.ts'
import { timezoneFromIP } from './geoCurrency.ts'
import { DEFAULT_USER_SETTINGS, type UserSettings } from '../types/settings.ts'

const SETTINGS_DOC_ID = 'preferences'

export function subscribeToUserSettings(
  uid: string,
  callback: (settings: UserSettings) => void,
) {
  return onSnapshot(
    doc(db, 'users', uid, 'settings', SETTINGS_DOC_ID),
    (snapshot) => {
      callback({ ...DEFAULT_USER_SETTINGS, ...snapshot.data() })
    },
  )
}

export async function updateUserSettings(
  uid: string,
  updates: Partial<UserSettings>,
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'settings', SETTINGS_DOC_ID), updates, {
    merge: true,
  })
}

/**
 * Fills in `timezone`/`dateFormat` with auto-detected values the first time
 * a user is seen, without touching either if they're already set — safe to
 * call on every sign-in (not just true first-time signup), since Google
 * sign-in doesn't distinguish the two. Timezone comes from IP geolocation
 * (falling back to the browser's own `Intl` zone on failure); date format
 * from the browser's locale. Both stay changeable in Settings afterwards.
 */
export async function ensureDefaultSettings(uid: string): Promise<void> {
  const settingsRef = doc(db, 'users', uid, 'settings', SETTINGS_DOC_ID)
  const snapshot = await getDoc(settingsRef)
  const existing = snapshot.data() as Partial<UserSettings> | undefined

  const updates: Partial<UserSettings> = {}
  if (!existing?.timezone) updates.timezone = await timezoneFromIP()
  if (!existing?.dateFormat) updates.dateFormat = detectDateFormat()

  if (Object.keys(updates).length > 0) {
    await setDoc(settingsRef, updates, { merge: true })
  }
}

/**
 * Internal bookkeeping (not a user-facing preference, so it's deliberately
 * outside `UserSettings`) for `lib/inventoryReconcile.ts` — the last local
 * date ('YYYY-MM-DD') whose meal consumption has already been applied to
 * inventory. Lives in the same settings doc purely to avoid an extra
 * document; null when this user has never been reconciled.
 */
export async function getInventoryReconciledThrough(
  uid: string,
): Promise<string | null> {
  const snapshot = await getDoc(doc(db, 'users', uid, 'settings', SETTINGS_DOC_ID))
  const value = snapshot.data()?.inventoryReconciledThrough
  return typeof value === 'string' ? value : null
}

export async function setInventoryReconciledThrough(
  uid: string,
  dateStr: string,
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'settings', SETTINGS_DOC_ID),
    { inventoryReconciledThrough: dateStr },
    { merge: true },
  )
}
