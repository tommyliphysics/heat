import { useDoses } from './useDoses.ts'
import { useCustomDoseLogs } from './useCustomDoseLogs.ts'
import { computeMissedOccurrences, type MissedOccurrence } from '../lib/customDoseStatus.ts'

/** The occurrence-based analog of `useMissedDoses`, for custom-schedule doses only. */
export function useMissedCustomOccurrences(): MissedOccurrence[] {
  const { doses, loaded: dosesLoaded } = useDoses()
  const customDoses = doses.filter((dose) => dose.scheduleType === 'custom')
  const { logsById, loaded: logsLoaded } = useCustomDoseLogs(customDoses)

  // See `useMissedDoses` for why: an empty `logsById` before the real
  // snapshot loads would otherwise flash every past occurrence as missed.
  if (!dosesLoaded || !logsLoaded) return []

  return computeMissedOccurrences(customDoses, logsById, new Date())
}
