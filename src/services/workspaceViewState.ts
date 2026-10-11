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
const VIEW_STORAGE_KEY = 'longedit.view-state.v1'
const safeView = (state: WorkspaceViewState): WorkspaceViewState => {
  const view: WorkspaceViewState = { scrollTop: Number.isFinite(state.scrollTop) ? Math.max(0, state.scrollTop) : 0, scrollLeft: Number.isFinite(state.scrollLeft) ? Math.max(0, state.scrollLeft) : 0 }
  for (const key of ['zoom', 'frozenColumns', 'panX', 'panY'] as const) if (typeof state[key] === 'number' && Number.isFinite(state[key])) view[key] = state[key]
  for (const key of ['fitWidth', 'sidebarOpen', 'panelOpen'] as const) if (typeof state[key] === 'boolean') view[key] = state[key]
  for (const key of ['section', 'sidebarTab', 'mode', 'externalApplication'] as const) if (typeof state[key] === 'string') view[key] = state[key].slice(0, 500)
  return view
}
const readStoredViews = (): Record<string, WorkspaceViewState> => {
  try {
    const raw = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || '{}') : {}
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).slice(-MAX_ENTRIES).filter(([, value]) => value && typeof value === 'object').map(([path, value]) => [path, safeView(value as WorkspaceViewState)]))
  } catch { return {} }
}

// Named sessions contain only view metadata, never editor drafts or cell values.
export const captureWorkspaceViewStates = (paths: string[]) => Object.fromEntries(paths.flatMap(path => {
  const state = recallWorkspaceViewState(path)
  if (!state) return []
  return [[path, safeView(state)]]
}))

export const restoreWorkspaceViewStates = (views: Record<string, WorkspaceViewState>, paths: string[]) => {
  for (const path of paths) {
    const view = views[path]
    if (!view || !Number.isFinite(view.scrollTop) || !Number.isFinite(view.scrollLeft)) continue
    rememberWorkspaceViewState(path, safeView(view))
  }
}

export const rememberWorkspaceViewState = (path: string, state: WorkspaceViewState) => {
  if (!path) return
  states.delete(path)
  states.set(path, { ...state })
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = readStoredViews()
      delete saved[path]; saved[path] = safeView(state)
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(saved).slice(-MAX_ENTRIES))))
    }
  } catch { /* Reading positions must not block editing when storage is unavailable. */ }
  while (states.size > MAX_ENTRIES) {
    const oldest = states.keys().next().value
    if (typeof oldest !== 'string') break
    states.delete(oldest)
  }
}

export const recallWorkspaceViewState = (path: string) => {
  const state = states.get(path) || readStoredViews()[path]
  return state ? { ...state } : undefined
}
