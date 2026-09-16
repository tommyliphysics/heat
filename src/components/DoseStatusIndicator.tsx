import Icon from './Icon.tsx'
import { formatCountdown, formatTimeOfDay, type DoseStatus } from '../lib/doseStatus.ts'

type DoseStatusIndicatorProps = {
  status: DoseStatus
  now: Date
}

function DoseStatusIndicator({ status, now }: DoseStatusIndicatorProps) {
  switch (status.kind) {
    case 'taken':
      return <Icon name="check" size={16} className="shopping-check-icon" />
    case 'untaken':
      return <span className="shopping-dot" aria-label="Not taken today" />
    case 'upcoming':
      return (
        <span className="dose-status-upcoming">
          {formatCountdown(status.time, now)}
        </span>
      )
    case 'missed':
      return (
        <span className="dose-status-missed">
          {formatTimeOfDay(status.time)}
        </span>
      )
  }
}

export default DoseStatusIndicator
