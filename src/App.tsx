import { Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import CreateAccountPage from './pages/CreateAccountPage.tsx'
import VerifyEmailPage from './pages/VerifyEmailPage.tsx'
import AuthenticatedShell from './components/AuthenticatedShell.tsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/create-account" element={<CreateAccountPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      {/* Every gated page is mounted once, permanently, inside here — see
          AuthenticatedShell/PageRegistry — rather than being individually
          routed, so navigating between them never loses in-progress state. */}
      <Route path="/*" element={<AuthenticatedShell />} />
    </Routes>
  )
}

export default App
