import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { safeSearchSelection as searchSelectionMetadata, safeSessionSearch, type SearchSelection, type WorkSessionSearch } from '../utils/workSessions'

type SearchSession = WorkSessionSearch
// Persist only search context; results and document text are always read afresh.
const sessions = new Map<string, SearchSession>()
const searchSessionKey = (root: string) => `longedit.search.v1:${encodeURIComponent(root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase())}`
const persistSearchSession = (root: string, session?: SearchSession) => {
  try {
    if (typeof localStorage === 'undefined') return
    if (session) localStorage.setItem(searchSessionKey(root), JSON.stringify(safeSessionSearch(session)))
    else localStorage.removeItem(searchSessionKey(root))
  } catch { /* Best effort auto-resume; never interrupt editing. */ }
}
export const snapshotSearchSession = (root: string) => {
  let session = sessions.get(root)
  if (!session) {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(searchSessionKey(root)) : null
      const saved = raw ? JSON.parse(raw) : null
      session = safeSessionSearch(saved)
    } catch { /* Keep unreadable data available for recovery. */ }
  }
  return session ? { ...session, types: [...session.types] } : undefined
}
export const restoreSearchSession = (root: string, session?: SearchSession) => {
  if (!session) { sessions.delete(root); persistSearchSession(root); return }
  const checked = safeSessionSearch(session)
  if (!checked) return
  sessions.set(root, checked)
  persistSearchSession(root, sessions.get(root))
}
export function useSearchReturn(options: {
  root: () => string; query: Ref<string>; types: Ref<string[]>;
  running: Ref<boolean>; failed: Ref<boolean>; resultKeys: () => string[];
  viewport: Ref<HTMLElement | null>; showResults: () => void;
  loadedFiles?: () => number; restoreLoadedFiles?: (count: number) => void;
  sort?: Ref<'relevance' | 'modified'>; hasMore?: () => boolean;
}) {
  const selectedKey = ref('')
  let selection: SearchSelection | undefined
  const notice = ref('')
  let scroll = 0, pending = false, focusResult = false, disposed = false
  const save = (root = options.root()) => {
    if (!root) return
    if (!options.query.value.trim()) { sessions.delete(root); persistSearchSession(root); return }
    if (!pending && !options.running.value && options.viewport.value) scroll = options.viewport.value.scrollTop
    sessions.delete(root)
    sessions.set(root, { query: options.query.value, types: [...options.types.value], selected: selectedKey.value, selection:searchSelectionMetadata(selectedKey.value) || selection, scroll,
      loadedFiles: Math.min(10000, options.loadedFiles?.() || 0), sort: options.sort?.value })
    persistSearchSession(root, sessions.get(root))
    if (sessions.size > 8) sessions.delete(sessions.keys().next().value!)
  }
  const apply = async () => {
    if (!pending || options.running.value || options.failed.value || !options.viewport.value) return
    await nextTick()
    if (disposed || !pending || options.running.value || options.failed.value || !options.viewport.value) return
    const viewport = options.viewport.value
    viewport.scrollTop = scroll
    const results = Array.from(viewport.querySelectorAll<HTMLElement>('[data-search-key]'))
    const result = results.find(item => item.dataset.searchKey === selectedKey.value) || (selection ? results.find(item=>JSON.stringify(searchSelectionMetadata(item.dataset.searchKey))===JSON.stringify(selection)) : undefined)
    if ((selectedKey.value || selection) && !result) {
      if (options.hasMore?.()) { notice.value = '原来的结果尚未加载，已保留选择，可继续加载文件。'; return }
      notice.value = '原来的结果已变化，已保留搜索条件，请从当前结果中选择。'
      selectedKey.value = ''; selection = undefined
    } else if (result) {
      selectedKey.value = result.dataset.searchKey || ''; selection = searchSelectionMetadata(selectedKey.value)
      notice.value = ''
      if (focusResult) {
        result.scrollIntoView({ block: 'nearest' })
        result.querySelector<HTMLButtonElement>('.knowledge-result-open')?.focus({ preventScroll: true })
      }
    }
    pending = false; focusResult = false
  }
  const remember = (key: string) => {
    selectedKey.value = key; selection = searchSelectionMetadata(key); notice.value = ''; pending = false
    scroll = options.viewport.value?.scrollTop ?? scroll
    save()
  }
  const restore = () => {
    const session = snapshotSearchSession(options.root())
    if (!session) return
    options.restoreLoadedFiles?.(session.loadedFiles || 0)
    if (options.sort && session.sort) options.sort.value = session.sort
    options.query.value = session.query
    options.types.value = [...session.types]
    selectedKey.value = session.selected; selection = session.selection || searchSelectionMetadata(session.selected); scroll = session.scroll
    // Search runs afresh; restore after its results arrive, not against stale content.
    pending = true
    options.showResults()
  }
  const returnToResults = () => {
    pending = true; focusResult = true
    options.showResults()
    void apply()
  }
  watch([options.query, options.types], () => {
    selectedKey.value = ''; selection = undefined; notice.value = ''; scroll = 0; pending = false
  }, { flush: 'sync', deep: true })
  watch(options.root, (_root, oldRoot) => {
    save(oldRoot)
    selectedKey.value = ''; selection = undefined; notice.value = ''; scroll = 0; pending = false
  }, { flush: 'sync' })
  watch([options.viewport, options.running, options.failed, options.resultKeys], () => { void apply() }, { flush: 'post' })
  onBeforeUnmount(() => { save(); disposed = true })
  const reconcile = () => { pending = true; focusResult = false; void apply() }
  const relocate = (event: Event) => {
    const { root, mapPath } = (event as CustomEvent<{ root: string; mapPath: (path: string) => string }>).detail
    const identity = (path: string) => path.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '').replace(/\/+$/, '').toLowerCase()
    for (const [path, cached] of sessions) if (identity(path) === identity(root) && cached.selection) cached.selection = [mapPath(cached.selection[0]), ...cached.selection.slice(1)] as SearchSelection
    if (identity(root) !== identity(options.root())) return
    const locator = searchSelectionMetadata(selectedKey.value) || selection
    if (locator) {
      selection = [mapPath(locator[0]), ...locator.slice(1)] as SearchSelection
      selectedKey.value = ''; pending = true
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('longedit:reading-paths-changed', relocate)
    onBeforeUnmount(() => window.removeEventListener('longedit:reading-paths-changed', relocate))
  }
  return { selectedKey, notice, remember, restore, returnToResults, reconcile }
}
