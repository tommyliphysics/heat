import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../firebase.ts'
import CustomDoseCheckModal from '../components/CustomDoseCheckModal.tsx'
import CustomDoseStatusIndicator from '../components/CustomDoseStatusIndicator.tsx'
import DoseCheckModal from '../components/DoseCheckModal.tsx'
import DoseStatusIndicator from '../components/DoseStatusIndicator.tsx'
import Icon from '../components/Icon.tsx'
import LoadingIndicator from '../components/LoadingIndicator.tsx'
import PageLayout from '../components/PageLayout.tsx'
import { useCustomDoseLogs } from '../hooks/useCustomDoseLogs.ts'
import { useDoses } from '../hooks/useDoses.ts'
import { useInventoryBatches } from '../hooks/useInventoryBatches.ts'
import { useMissedCustomOccurrences } from '../hooks/useMissedCustomOccurrences.ts'
import { useMissedDoses } from '../hooks/useMissedDoses.ts'
import { useTodayDoseLogs } from '../hooks/useTodayDoseLogs.ts'
import { useUserSettings } from '../hooks/useUserSettings.ts'
import { computeCustomDoseStatus } from '../lib/customDoseStatus.ts'
import { clearMissedCustomOccurrence, setCustomOccurrenceTaken } from '../lib/customDoseLog.ts'
import { computeDoseStatus, formatOccurrenceDateTime } from '../lib/doseStatus.ts'
import { clearMissedDose, markDoseFullyTaken } from '../lib/doseLog.ts'
import { latestRemaining } from '../lib/inventory.ts'
import { formatShortDate, parseDateStr } from '../lib/timeline.ts'
import type { MissedOccurrence } from '../lib/customDoseStatus.ts'
import type { MissedDose } from '../lib/missedDoses.ts'
import type { DoseListItem } from '../types/doses.ts'
import type { DateFormat } from '../types/settings.ts'
import './pages.css'

type MissedRow = {
  key: string
  doseName: string
  dateLabel: string
  sortKey: number
  onClear: () => Promise<void>
  onMarkTaken: () => Promise<void>
}

function recurringMissedRow(missed: MissedDose, dateFormat: DateFormat): MissedRow {
  return {
    key: `recurring-${missed.doseId}-${missed.date}`,
    doseName: missed.doseName,
    dateLabel: formatShortDate(missed.date, dateFormat),
    sortKey: parseDateStr(missed.date).getTime(),
    onClear: async () => {
      const user = auth.currentUser
      if (!user) return
      await clearMissedDose(user.uid, missed.doseId, missed.date, missed.taken)
    },
    onMarkTaken: async () => {
      const user = auth.currentUser
      if (!user) return
      await markDoseFullyTaken(user.uid, missed.dose, missed.date, missed.taken)
    },
  }
}

function customMissedRow(missed: MissedOccurrence): MissedRow {
  return {
    key: `custom-${missed.doseId}-${missed.entryId}-${missed.occurrenceIndex}`,
    doseName: missed.doseName,
    dateLabel: formatOccurrenceDateTime(missed.at),
    sortKey: missed.at,
    onClear: async () => {
      const user = auth.currentUser
      if (!user) return
      await clearMissedCustomOccurrence(user.uid, missed.doseId, missed.entryId, missed.occurrenceIndex, missed.at)
    },
    onMarkTaken: async () => {
      const user = auth.currentUser
      if (!user) return
      await setCustomOccurrenceTaken(
        user.uid,
        missed.dose,
        { entryId: missed.entryId, occurrenceIndex: missed.occurrenceIndex, at: missed.at, doseCount: missed.doseCount },
        true,
      )
    },
  }
}

function DailyDosesPage() {
  const navigate = useNavigate()
  const { doses, loaded } = useDoses()
  const { batches: inventoryBatches } = useInventoryBatches()
  const batchesById = new Map(inventoryBatches.map((batch) => [batch.id, batch]))
  const customDoses = doses.filter((dose) => dose.scheduleType === 'custom')
  // Custom-schedule doses log to a separate collection (`customDoseLogs`), so
  // they're excluded here to avoid the day-indexed missed-dose scan
  // misreading their (nonexistent) `doseLogs` history as every day missed.
  const missedDoses = useMissedDoses().filter((m) => m.dose.scheduleType !== 'custom')
  const missedCustomOccurrences = useMissedCustomOccurrences()
  const logs = useTodayDoseLogs()
  const { logsById: customLogs } = useCustomDoseLogs(customDoses)
  const { dateFormat } = useUserSettings()
  const [now, setNow] = useState(() => new Date())
  const [checkDose, setCheckDose] = useState<DoseListItem | null>(null)

  // Keeps the "upcoming" countdowns and "missed" transitions current without
  // requiring the user to refresh the page.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const missedRows = [
    ...missedDoses.map((m) => recurringMissedRow(m, dateFormat)),
    ...missedCustomOccurrences.map(customMissedRow),
  ].sort((a, b) => a.sortKey - b.sortKey)

  return (
    <>
      <PageLayout header={<h1>Daily Doses</h1>}>
        <Link to="/doses/add" className="btn btn-primary page-add-btn">
          <Icon name="plus" size={16} />
          Add Dose
        </Link>

        {missedRows.length > 0 && (
          <div className="foods-table-wrap">
            <table className="foods-table shopping-list-table missed-doses-table">
              <thead>
                <tr>
                  <th>Missed Dose</th>
                  <th>Date</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {missedRows.map((row) => (
                  <tr key={row.key} className="missed-dose-row">
                    <td>{row.doseName}</td>
                    <td className="cell-mono">{row.dateLabel}</td>
                    <td className="missed-dose-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => row.onClear()}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => row.onMarkTaken()}
                      >
                        Mark Taken
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loaded ? (
          <LoadingIndicator />
        ) : doses.length === 0 ? (
          <p>No doses added yet.</p>
        ) : (
          <div className="foods-table-wrap">
            <table className="foods-table shopping-list-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Dose</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {doses.map((dose) => {
                  const isCustom = dose.scheduleType === 'custom'
                  const batch = dose.inventoryBatchId
                    ? batchesById.get(dose.inventoryBatchId)
                    : undefined
                  return (
                    <tr key={dose.id} onClick={() => setCheckDose(dose)}>
                      <td>{dose.name}</td>
                      <td className="cell-mono">{dose.dose}</td>
                      <td className="cell-mono">{batch ? latestRemaining(batch) : ''}</td>
                      <td className="cell-mono">
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
                      </td>
                      <td className="shopping-row-delete">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Edit ${dose.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/doses/${dose.id}/edit`)
                          }}
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageLayout>

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
    </>
  )
}

export default DailyDosesPage
