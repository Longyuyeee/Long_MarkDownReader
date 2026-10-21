export interface WorkspaceViewState {
  pdfAnnotations?: { signature:string; id:string; query:string; pages:string; kind:string; color:string; listPage:number; selection:string[]; scrollTop:number }
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
const SESSION_VIEW_KEY = 'longedit.session-view-state.v1'
const viewIdentity = (path: string) => path.replace(/^\\\\\?\\UNC\\/i, '//').replace(/^\\\\\?\\/, '').replace(/\\/g, '/').toLowerCase()
let staged: Map<string, WorkspaceViewState> | undefined
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

const stagedViews = () => {
  if (staged) return staged
  staged = new Map()
  try {
    const saved = typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(SESSION_VIEW_KEY) || 'null')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [path, value] of Object.entries(saved).slice(0, 128)) {
      const view = value as WorkspaceViewState
      if (view && Number.isFinite(view.scrollTop) && Number.isFinite(view.scrollLeft)) staged.set(viewIdentity(path), safeView(view))
    }
  } catch { /* Preserve unreadable storage. Named scenes remain repairable. */ }
  return staged
}

// A bounded metadata queue, not an expanded editor/draft cache. Do not eagerly
// insert 128 positions into the existing 24-item live cache and evict the first.
export const stageWorkspaceViewStates = (views: Record<string, WorkspaceViewState>, paths: string[]) => {
  if (paths.length > 128) throw Error('一次最多恢复 128 份文件的阅读位置')
  const previous = new Map(stagedViews()), live = new Map(states)
  const oldRaw = localStorage.getItem(SESSION_VIEW_KEY)
  const entries = Object.entries(views), next = new Map(stagedViews())
  for (const path of paths) {
    const value = views[path] || entries.find(([key]) => viewIdentity(key) === viewIdentity(path))?.[1]
    if (value && Number.isFinite(value.scrollTop) && Number.isFinite(value.scrollLeft)) {
      next.delete(viewIdentity(path)); next.set(viewIdentity(path), safeView(value))
    }
  }
  while (next.size > 128) next.delete(next.keys().next().value!)
  // Fail before touching live models/cache when storage is unavailable.
  localStorage.setItem(SESSION_VIEW_KEY, JSON.stringify(Object.fromEntries(next)))
  staged = next
  const identities = new Set(paths.map(viewIdentity))
  for (const key of states.keys()) if (identities.has(viewIdentity(key))) states.delete(key)
  return () => {
    try { if (oldRaw === null) localStorage.removeItem(SESSION_VIEW_KEY); else localStorage.setItem(SESSION_VIEW_KEY, oldRaw) }
    finally { staged = previous; states.clear(); for (const [key, value] of live) states.set(key, value) }
  }
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
      if (stagedViews().has(viewIdentity(path))) {
        stagedViews().set(viewIdentity(path), safeView(state))
        localStorage.setItem(SESSION_VIEW_KEY, JSON.stringify(Object.fromEntries(stagedViews())))
      }
    }
  } catch { /* Reading positions must not block editing when storage is unavailable. */ }
  while (states.size > MAX_ENTRIES) {
    const oldest = states.keys().next().value
    if (typeof oldest !== 'string') break
    states.delete(oldest)
  }
}

export const recallWorkspaceViewState = (path: string) => {
  const state = states.get(path) || stagedViews().get(viewIdentity(path)) || readStoredViews()[path]
  return state ? { ...state } : undefined
}
