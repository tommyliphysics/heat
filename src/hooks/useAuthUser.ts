import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../firebase.ts'

type Listener = (user: User | null) => void

let currentUser: User | null = null
let resolved = false
const listeners = new Set<Listener>()

// Subscribed once for the whole app session so every `useAuthUser` call
// shares this state instead of each mounting its own onAuthStateChanged
// listener — that per-mount subscription was what made every route change
// flash blank while a fresh listener re-resolved auth state it already knew.
onAuthStateChanged(auth, (user) => {
  currentUser = user
  resolved = true
  for (const listener of listeners) listener(user)
})

function useAuthUser() {
  const [user, setUser] = useState(currentUser)
  const [checked, setChecked] = useState(resolved)

  useEffect(() => {
    if (resolved) {
      setUser(currentUser)
      setChecked(true)
    }

    const listener: Listener = (nextUser) => {
      setUser(nextUser)
      setChecked(true)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return { user, checked }
}

export default useAuthUser
