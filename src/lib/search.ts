/**
 * True if every word in `query` appears somewhere in `name`, in any order —
 * so a query like "beef steak" matches a name like "Steak, beef, grilled"
 * even though the words appear in the opposite order and aren't adjacent.
 */
export function matchesQuery(name: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return false

  const target = name.toLowerCase()
  return words.every((word) => target.includes(word))
}
