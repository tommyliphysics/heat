import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { sendEmailVerification, signOut } from 'firebase/auth'
import { auth } from '../firebase.ts'
import PageLayout from '../components/PageLayout.tsx'
import { takePendingPath } from '../lib/pendingPath.ts'
import './pages.css'

function VerifyEmailPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState('')

  const user = auth.currentUser

  if (!user) {
    return <Navigate to="/" replace />
  }

  async function handleCheckVerified() {
    setError('')
    setResent(false)
    setChecking(true)
    try {
      await user!.reload()
      if (auth.currentUser?.emailVerified) {
        navigate(takePendingPath())
      } else {
        setError(
          "Still not verified. Click the link in the email, then try again.",
        )
      }
    } catch {
      setError('Could not check verification status. Please try again.')
    } finally {
      setChecking(false)
    }
  }

  async function handleResend() {
    setError('')
    setResent(false)
    try {
      await sendEmailVerification(user!)
      setResent(true)
    } catch {
      setError('Could not resend the verification email. Please try again.')
    }
  }

  async function handleLogout() {
    await signOut(auth)
    navigate('/')
  }

  return (
    <PageLayout
      header={<h1>Verify Your Email</h1>}
      footer={
        <button type="button" className="back-link" onClick={handleLogout}>
          Log out
        </button>
      }
    >
      <p>
        We sent a verification link to <strong>{user.email}</strong>. Click
        the link, then continue below.
      </p>

      {resent && <p>Verification email resent.</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleCheckVerified}
          disabled={checking}
        >
          {checking ? 'Checking...' : "I've verified my email"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleResend}
        >
          Resend email
        </button>
      </div>
    </PageLayout>
  )
}

export default VerifyEmailPage
