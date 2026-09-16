import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  onIdTokenChanged,
  sendEmailVerification,
  unlink,
  updateEmail,
  updatePassword,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase.ts'
import DeleteAccountModal from '../components/DeleteAccountModal.tsx'
import GoogleButton from '../components/GoogleButton.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import { hasGoogleProvider, hasPasswordProvider, reauthenticate } from '../lib/account.ts'
import './pages.css'

function AccountPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(auth.currentUser)

  useEffect(() => onIdTokenChanged(auth, setUser), [])

  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [googleError, setGoogleError] = useState('')
  const [savingGoogle, setSavingGoogle] = useState(false)

  const { deletionRequestedAt } = useUserSettings()
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!user) {
    return (
      <PageLayout header={<h1>My Details</h1>}>
        <LoadingIndicator />
      </PageLayout>
    )
  }

  const hasPassword = hasPasswordProvider(user)
  const hasGoogle = hasGoogleProvider(user)

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    setSavingEmail(true)
    try {
      await reauthenticate(user!, emailPassword)
      await updateEmail(user!, newEmail)
      await sendEmailVerification(user!)
      setNewEmail('')
      setEmailPassword('')
      navigate('/verify-email')
    } catch {
      setEmailError(
        'Could not update email. Check your details and try again.',
      )
    } finally {
      setSavingEmail(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setSavingPassword(true)
    try {
      await reauthenticate(user!, currentPassword)
      if (hasPassword) {
        await updatePassword(user!, newPassword)
      } else {
        if (!user!.email) throw new Error('Account has no email on file')
        await linkWithCredential(
          user!,
          EmailAuthProvider.credential(user!.email, newPassword),
        )
      }
      setPasswordSuccess(hasPassword ? 'Password updated.' : 'Password set.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    } catch {
      setPasswordError(
        hasPassword
          ? 'Could not update password. Check your current password and try again.'
          : 'Could not set a password. Please try again.',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleConnectGoogle() {
    setGoogleError('')
    setSavingGoogle(true)
    try {
      await linkWithPopup(user!, googleProvider)
    } catch {
      setGoogleError('Could not connect Google. Please try again.')
    } finally {
      setSavingGoogle(false)
    }
  }

  async function handleDisconnectGoogle() {
    setGoogleError('')
    setSavingGoogle(true)
    try {
      await unlink(user!, GoogleAuthProvider.PROVIDER_ID)
    } catch {
      setGoogleError('Could not disconnect Google. Please try again.')
    } finally {
      setSavingGoogle(false)
    }
  }

  return (
    <PageLayout header={<h1>My Details</h1>}>
      <form className="auth-form" onSubmit={handleChangeEmail}>
        <h2 className="form-section-heading">Email</h2>
        <p className="account-current-value">{user.email}</p>

        <label htmlFor="new-email">New Email</label>
        <input
          id="new-email"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          autoComplete="email"
          required
        />

        {hasPassword ? (
          <>
            <label htmlFor="email-current-password">Current Password</label>
            <input
              id="email-current-password"
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </>
        ) : (
          <p className="account-hint">
            You'll be asked to confirm with Google before this takes effect.
          </p>
        )}

        {emailError && <p className="form-error">{emailError}</p>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={savingEmail}
        >
          {savingEmail ? 'Updating...' : 'Update Email'}
        </button>
      </form>

      <form className="auth-form" onSubmit={handleChangePassword}>
        <h2 className="form-section-heading">Password</h2>

        {hasPassword ? (
          <>
            <label htmlFor="current-password">Current Password</label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </>
        ) : (
          <p className="account-hint">
            Your account currently only signs in with Google. Set a password
            below to confirm, then also sign in with email.
          </p>
        )}

        <label htmlFor="new-password">New Password</label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <label htmlFor="confirm-new-password">Confirm New Password</label>
        <input
          id="confirm-new-password"
          type="password"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        {passwordError && <p className="form-error">{passwordError}</p>}
        {passwordSuccess && <p>{passwordSuccess}</p>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={savingPassword}
        >
          {savingPassword
            ? 'Saving...'
            : hasPassword
              ? 'Update Password'
              : 'Set Password'}
        </button>
      </form>

      <div className="auth-form">
        <h2 className="form-section-heading">Google Account</h2>

        {googleError && <p className="form-error">{googleError}</p>}

        {hasGoogle ? (
          <>
            <p>Your account is connected to Google.</p>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={handleDisconnectGoogle}
              disabled={savingGoogle || !hasPassword}
            >
              {savingGoogle ? 'Disconnecting...' : 'Disconnect Google'}
            </button>
            {!hasPassword && (
              <p className="account-hint">
                Set a password above before disconnecting Google, or you
                won't be able to sign in.
              </p>
            )}
          </>
        ) : (
          <GoogleButton
            label={savingGoogle ? 'Connecting...' : 'Connect Google'}
            onClick={handleConnectGoogle}
            disabled={savingGoogle}
          />
        )}
      </div>

      <div className="auth-form">
        <h2 className="form-section-heading">Danger Zone</h2>

        {deletionRequestedAt ? (
          <p>
            Your account is scheduled for deletion. This can take a little
            while to process.
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-danger btn-full"
            onClick={() => setDeleteOpen(true)}
          >
            Delete Account
          </button>
        )}
      </div>

      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        user={user}
        onRequested={() => setDeleteOpen(false)}
      />
    </PageLayout>
  )
}

export default AccountPage
