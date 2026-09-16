/** Formats a duration in minutes as e.g. "45 min", "1h", or "1h 15m". */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes)
  if (total < 60) return `${total} min`

  const hours = Math.floor(total / 60)
  const remainder = total % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}
