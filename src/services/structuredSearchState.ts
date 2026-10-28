// Window-local preferences for actual open tabs; never document/match history.
export interface StructuredSearchState {
  search: string; replace: string; caseSensitive: boolean; regexp: boolean
  wholeWord: boolean; literal: boolean; open: boolean
}
const states = new WeakMap<object, { scope: string; state?: StructuredSearchState }>()
export function claimStructuredSearch(tab: object, scope: string) {
  const prior = states.get(tab)
  const entry = { scope, state: prior?.scope === scope && prior.state ? { ...prior.state } : undefined }
  states.set(tab, entry)
  return {
    state: entry.state && { ...entry.state },
    current: () => states.get(tab) === entry,
    remember(state: StructuredSearchState) { if (states.get(tab) === entry) entry.state = { ...state } },
  }
}
