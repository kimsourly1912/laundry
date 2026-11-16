/**
 * The queries on screen, by key (`<feature>:<name>`), so a write can refresh what it changed:
 * `invalidate('platform')` refreshes every `platform:*` query shown now. A query off screen loads
 * fresh when next shown (`useAsyncData` drops its data on unmount).
 */

interface RegisteredQuery {
  key: () => string
  refresh: () => Promise<unknown>
}

const queries = new Set<RegisteredQuery>()

/** Called by `useApiQuery`; returns the function that unregisters it. */
export function registerQuery(query: RegisteredQuery): () => void {
  queries.add(query)
  return () => queries.delete(query)
}

const featureOf = (key: string) => key.slice(0, key.indexOf(':'))

/** Refreshes every query on screen whose feature (the key before `:`) is one of `features`. */
export async function invalidate(...features: string[]): Promise<void> {
  await Promise.allSettled([...queries].filter(query => features.includes(featureOf(query.key()))).map(query => query.refresh()))
}
