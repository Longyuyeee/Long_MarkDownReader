// Reading state belongs to an open tab, never to its document or save receipt.
// A rename keeps that tab object; closing/reopening creates a fresh owner.
export interface StructuredOutlineState {
  query: string
  selection?: string
  expanded: string[]
  mode: 'source' | 'tree'
  collapsed?: string[]
  treeSelection?: string
}
const empty = (): StructuredOutlineState => ({ query: '', expanded: [], mode: 'source' })
const copy = (state: StructuredOutlineState): StructuredOutlineState => ({
  ...state, expanded: [...state.expanded], collapsed: state.collapsed && [...state.collapsed],
})
const states = new WeakMap<object, { scope: string; state: StructuredOutlineState; lease: object }>()

export function claimStructuredOutlineState(tab: object, scope: string, seed = empty()) {
  const prior = states.get(tab), lease = {}
  const entry = { scope, lease, state: prior?.scope === scope ? copy(prior.state) : copy(seed) }
  states.set(tab, entry)
  return {
    state: copy(entry.state),
    remember(state: StructuredOutlineState) {
      // A previous editor can finish unmounting after the replacement mounts.
      if (states.get(tab)?.lease === lease) entry.state = copy(state)
    },
  }
}
