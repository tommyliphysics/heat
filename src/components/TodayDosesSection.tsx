import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CustomDoseCheckModal from './CustomDoseCheckModal.tsx'
import CustomDoseStatusIndicator from './CustomDoseStatusIndicator.tsx'
import DoseCheckModal from './DoseCheckModal.tsx'
import DoseStatusIndicator from './DoseStatusIndicator.tsx'
import Icon from './Icon.tsx'
import LoadingIndicator from './LoadingIndicator.tsx'
import { useCustomDoseLogs } from '../hooks/useCustomDoseLogs.ts'
import { useDoses } from '../hooks/useDoses.ts'
import { useTodayDoseLogs } from '../hooks/useTodayDoseLogs.ts'
import { computeCustomDoseStatus } from '../lib/customDoseStatus.ts'
import { computeDoseStatus } from '../lib/doseStatus.ts'
import type { DoseListItem } from '../types/doses.ts'

function TodayDosesSection() {
  const { doses, loaded } = useDoses()
  const customDoses = doses.filter((dose) => dose.scheduleType === 'custom')
  const logs = useTodayDoseLogs()
  const { logsById: customLogs } = useCustomDoseLogs(customDoses)
  const [now, setNow] = useState(() => new Date())
  const [checkDose, setCheckDose] = useState<DoseListItem | null>(null)

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="dashboard-section">
      <h2 className="dashboard-section-heading">
        <span>
          <Icon name="pill" size={16} />
          Doses
        </span>
        <Link to="/doses/add" className="icon-btn" aria-label="Add dose">
          <Icon name="plus" size={16} />
        </Link>
      </h2>

      {!loaded ? (
        <LoadingIndicator />
      ) : doses.length === 0 ? (
        <p>No doses added yet.</p>
      ) : (
        <ul className="dashboard-list">
          {doses.map((dose) => {
            const isCustom = dose.scheduleType === 'custom'
            return (
              <li key={dose.id}>
                <button
                  type="button"
                  className="dashboard-row"
                  onClick={() => setCheckDose(dose)}
                >
                  <span>{dose.name}</span>
                  <span className="dashboard-row-meta">
                    {isCustom ? (
                      <CustomDoseStatusIndicator
                        status={computeCustomDoseStatus(dose, customLogs, now)}
                        now={now}
                      />
                    ) : (
                      <DoseStatusIndicator
                        status={computeDoseStatus(dose, logs[dose.id] ?? [], now)}
                        now={now}
                      />
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <DoseCheckModal
        open={checkDose !== null && checkDose.scheduleType !== 'custom'}
        onClose={() => setCheckDose(null)}
        dose={checkDose && checkDose.scheduleType !== 'custom' ? checkDose : null}
        taken={checkDose ? (logs[checkDose.id] ?? []) : []}
      />

      <CustomDoseCheckModal
        open={checkDose !== null && checkDose.scheduleType === 'custom'}
        onClose={() => setCheckDose(null)}
        dose={checkDose && checkDose.scheduleType === 'custom' ? checkDose : null}
        logsByOccurrenceId={customLogs}
        now={now}
      />
    </section>
  )
}

export default TodayDosesSection
