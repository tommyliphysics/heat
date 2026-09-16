import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth'
import { auth } from '../firebase.ts'
import GoogleButton from '../components/GoogleButton.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { signInWithGoogle } from '../lib/googleSignIn.ts'
import { takePendingPath } from '../lib/pendingPath.ts'
import { ensureDefaultSettings } from '../lib/settings.ts'
import './pages.css'

function CreateAccountPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      )
      // Best-effort — never block signup on IP geolocation being slow/down.
      ensureDefaultSettings(credential.user.uid).catch(() => {})
      await sendEmailVerification(credential.user)
      navigate('/verify-email')
    } catch {
      setError('Could not create account. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleGoogleSignIn() {
    setError('')
    const success = await signInWithGoogle()
    if (success) {
      if (auth.currentUser) {
        ensureDefaultSettings(auth.currentUser.uid).catch(() => {})
      }
      navigate(takePendingPath())
    } else {
      setError('Google sign-in failed. Please try again.')
    }
  }

  return (
    <PageLayout
      header={<h1>Create Account</h1>}
      footer={
        <Link to="/" className="back-link">
          &larr; Back
        </Link>
      }
    >
      <GoogleButton label="Sign up with Google" onClick={handleGoogleSignIn} />

      <div className="divider">or</div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <label htmlFor="confirm-password">Confirm Password</label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Creating...' : 'Create Account'}
        </button>
      </form>
    </PageLayout>
  )
}

export default CreateAccountPage
