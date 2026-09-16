import { useNavigate } from 'react-router-dom'
import Icon from './Icon.tsx'
import { useNavHistory } from '../hooks/useNavHistory.ts'

/** Only shown once the user has gone back at least once this session and there's somewhere forward to return to — see NavHistoryContext. */
function ForwardButton() {
  const navigate = useNavigate()
  const { canGoForward } = useNavHistory()

  if (!canGoForward) return null

  return (
    <button
      type="button"
      className="back-link"
      onClick={() => navigate(1)}
    >
      Forward
      <Icon name="arrow-right" size={15} />
    </button>
  )
}

export default ForwardButton
