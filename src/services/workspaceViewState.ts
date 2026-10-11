export interface WorkspaceViewState {
  scrollTop: number
  scrollLeft: number
  section?: string
  frozenColumns?: number
  zoom?: number
  fitWidth?: boolean
  sidebarOpen?: boolean
  sidebarTab?: string
  panelOpen?: boolean
  mode?: string
  panX?: number
  panY?: number
  selection?: string
  externalApplication?: string
  draft?: string
}

const MAX_ENTRIES = 24
const states = new Map<string, WorkspaceViewState>()

// Named sessions contain only view metadata, never editor drafts or cell values.
export const captureWorkspaceViewStates = (paths: string[]) => Object.fromEntries(paths.flatMap(path => {
  const state = states.get(path)
  if (!state) return []
  const { draft: _draft, selection: _selection, ...view } = state
  return [[path, view]]
}))

export const restoreWorkspaceViewStates = (views: Record<string, WorkspaceViewState>, paths: string[]) => {
  for (const path of paths) {
    const view = views[path]
    if (!view || !Number.isFinite(view.scrollTop) || !Number.isFinite(view.scrollLeft)) continue
    const { draft: _draft, selection: _selection, ...safeView } = view
    rememberWorkspaceViewState(path, safeView)
  }
}

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
