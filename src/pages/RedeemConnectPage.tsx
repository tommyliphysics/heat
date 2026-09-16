import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.ts'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { useRouteParam } from '../hooks/useRouteParam.ts'
import { getConnectCodeInfo, requestConnection } from '../lib/connect.ts'
import { setUsername as saveUsername } from '../lib/profile.ts'
import { subscribeToUserSettings } from '../lib/settings.ts'
import type { ConnectCodeDocument } from '../types/connections.ts'

type LookupState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'self' }
  | { status: 'already-connected' }
  | { status: 'already-requested' }
  | { status: 'ready'; info: ConnectCodeDocument }
  | { status: 'sent' }

function RedeemConnectPage() {
  const code = useRouteParam('/connect/:code', 'code')
  const navigate = useNavigate()
  const [state, setState] = useState<LookupState>({ status: 'loading' })
  const [username, setUsername] = useState<string | null>(null)
  const [usernameDraft, setUsernameDraft] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    return subscribeToUserSettings(user.uid, (settings) => {
      setUsername(settings.username ?? '')
    })
  }, [])

  useEffect(() => {
    if (!code) return
    const user = auth.currentUser
    if (!user) return

    setState({ status: 'loading' })
    getConnectCodeInfo(code).then(async (info) => {
      if (!info) {
        setState({ status: 'not-found' })
        return
      }
      if (info.uid === user.uid) {
        setState({ status: 'self' })
        return
      }

      const [connectionSnapshot, requestSnapshot] = await Promise.all([
        getDoc(doc(db, 'users', user.uid, 'connections', info.uid)),
        getDoc(doc(db, 'users', info.uid, 'connectionRequests', user.uid)),
      ])
      if (connectionSnapshot.exists()) {
        setState({ status: 'already-connected' })
      } else if (requestSnapshot.exists()) {
        setState({ status: 'already-requested' })
      } else {
        setState({ status: 'ready', info })
      }
    })
  }, [code])

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

  async function handleSend() {
    const user = auth.currentUser
    if (!user?.email || !code || !username) return

    setError('')
    setSending(true)
    const result = await requestConnection(code, user.uid, user.email, username)
    setSending(false)
    if (result.ok) {
      setState({ status: 'sent' })
    } else {
      setError(result.reason)
    }
  }

  return (
    <PageLayout header={<h1>Connect</h1>}>
      {state.status === 'loading' && <LoadingIndicator />}
      {state.status === 'not-found' && <p>This code is invalid.</p>}
      {state.status === 'self' && <p>This is your own connect code.</p>}
      {state.status === 'already-connected' && (
        <>
          <p>You're already connected.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/network')}
          >
            View Connections
          </button>
        </>
      )}
      {state.status === 'already-requested' && (
        <p>You've already sent a request — waiting for it to be accepted.</p>
      )}
      {state.status === 'sent' && (
        <>
          <p>Request sent — you'll show up in their connections once they accept it.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          <p>Send {state.info.username} a connection request?</p>
          <p className="form-hint">
            They'll need to accept it before you're connected. Once you are,
            you'll both be able to see whatever foods and recipes the other
            shares with a group you're both in.
          </p>

          {username === '' ? (
            <div className="auth-form">
              <label htmlFor="redeem-username">Choose a username first</label>
              <div className="unit-row">
                <input
                  id="redeem-username"
                  type="text"
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value)}
                  disabled={savingUsername}
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
                Needed so {state.info.username} knows who's asking to connect.
              </p>
            </div>
          ) : (
            <div className="confirm-delete-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/dashboard')}
                disabled={sending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
        </>
      )}
    </PageLayout>
  )
}

export default RedeemConnectPage
