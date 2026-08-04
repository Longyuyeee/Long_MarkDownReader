export interface WorkspaceViewState {
  scrollTop: number
  scrollLeft: number
  section?: string
}

const MAX_ENTRIES = 24
const states = new Map<string, WorkspaceViewState>()

export const rememberWorkspaceViewState = (path: string, state: WorkspaceViewState) => {
  if (!path) return
  states.delete(path)
  states.set(path, { ...state })
  while (states.size > MAX_ENTRIES) {
    const oldest = states.keys().next().value
    if (typeof oldest !== 'string') break
    states.delete(oldest)
  }
}

export const recallWorkspaceViewState = (path: string) => {
  const state = states.get(path)
  return state ? { ...state } : undefined
}
