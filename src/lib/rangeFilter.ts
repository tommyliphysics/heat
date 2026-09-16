export type RangeFilter = { min: string; max: string }

export function inRange(value: number, range: RangeFilter): boolean {
  if (range.min.trim() !== '' && value < Number(range.min)) return false
  if (range.max.trim() !== '' && value > Number(range.max)) return false
  return true
}
