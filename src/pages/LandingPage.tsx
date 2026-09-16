import { Link } from 'react-router-dom'
import PageLayout from '../components/PageLayout.tsx'
import './pages.css'

function LandingPage() {
  return (
    <PageLayout
      header={
        <h1 className="landing-brand">
          <img src="/logo.png" alt="Heat" className="landing-logo" />
        </h1>
      }
    >
      <div className="actions">
        <Link to="/login" className="btn btn-primary">
          Log In
        </Link>
        <Link to="/create-account" className="btn btn-secondary">
          Create Account
        </Link>
      </div>
    </PageLayout>
  )
}

export default LandingPage
