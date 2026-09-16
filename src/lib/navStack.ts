export type NavStackDirection = 'back' | 'forward' | null

export type NavStack = {
  keys: string[]
  index: number
}

export function createNavStack(initialKey: string): NavStack {
  return { keys: [initialKey], index: 0 }
}

/**
 * Applies one navigation to a nav stack in place, returning the POP
 * direction (or `null` for a PUSH/REPLACE, or an untracked POP — e.g. real
 * browser history predating a refresh, reset to a fresh baseline instead of
 * guessing). Pure bookkeeping shared by `NavHistoryContext` (exposes
 * `canGoBack`/`canGoForward` to BackButton/ForwardButton/the swipe hook) and
 * `PageRegistry` (drives the slide transition) — each keeps its own stack
 * instance, computed at its own component's own timing, since the two need
 * different synchronization guarantees (see PageRegistry.tsx's comment).
 */
export function applyNavigation(
  stack: NavStack,
  navigationType: 'PUSH' | 'REPLACE' | 'POP',
  key: string,
): NavStackDirection {
  if (navigationType === 'PUSH') {
    stack.keys.splice(stack.index + 1)
    stack.keys.push(key)
    stack.index = stack.keys.length - 1
    return null
  }

  if (navigationType === 'REPLACE') {
    stack.keys[stack.index] = key
    return null
  }

  const idx = stack.keys.indexOf(key)
  if (idx === -1) {
    stack.keys = [key]
    stack.index = 0
    return null
  }

  const direction: NavStackDirection = idx > stack.index ? 'forward' : 'back'
  stack.index = idx
  return direction
}
