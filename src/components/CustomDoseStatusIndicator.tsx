import Icon from './Icon.tsx'
import { formatCountdownFromNow, formatOccurrenceDateTime } from '../lib/doseStatus.ts'
import type { CustomDoseStatus } from '../lib/customDoseStatus.ts'

type CustomDoseStatusIndicatorProps = {
  status: CustomDoseStatus
  now: Date
}

function CustomDoseStatusIndicator({ status, now }: CustomDoseStatusIndicatorProps) {
  switch (status.kind) {
    case 'taken':
      return <Icon name="check" size={16} className="shopping-check-icon" />
    case 'none':
      return <span className="shopping-dot" aria-label="No scheduled doses" />
    case 'upcoming':
      return (
        <span className="dose-status-upcoming">
          {formatCountdownFromNow(status.occurrence.at, now)}
        </span>
      )
    case 'missed':
      return (
        <span className="dose-status-missed">
          {formatOccurrenceDateTime(status.occurrence.at)}
        </span>
      )
  }
}

export default CustomDoseStatusIndicator
