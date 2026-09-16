import { useEffect, useState } from 'react'
import { auth } from '../firebase.ts'
import { subscribeToUserSettings } from '../lib/settings.ts'
import { DEFAULT_USER_SETTINGS, type UserSettings } from '../types/settings.ts'

export function useUserSettings(): UserSettings {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS)

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return subscribeToUserSettings(user.uid, setSettings)
  }, [])

  return settings
}
