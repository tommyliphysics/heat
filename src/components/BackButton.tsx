import { useNavigate } from 'react-router-dom'
import Icon from './Icon.tsx'

function BackButton() {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      className="back-link"
      onClick={() => navigate(-1)}
    >
      <Icon name="arrow-left" size={15} />
      Back
    </button>
  )
}

export default BackButton
