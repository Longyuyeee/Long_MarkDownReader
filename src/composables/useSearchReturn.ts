import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'

interface SearchSession { query: string; types: string[]; selected: string; scroll: number }
// Persist only search context; results and document text are always read afresh.
const sessions = new Map<string, SearchSession>()
const searchSessionKey = (root: string) => `longedit.search.v1:${encodeURIComponent(root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase())}`
const persistSearchSession = (root: string, session?: SearchSession) => {
  try {
    if (typeof localStorage === 'undefined') return
    if (session) localStorage.setItem(searchSessionKey(root), JSON.stringify(session))
    else localStorage.removeItem(searchSessionKey(root))
  } catch { /* Best effort auto-resume; never interrupt editing. */ }
}
export const snapshotSearchSession = (root: string) => {
  let session = sessions.get(root)
  if (!session) {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(searchSessionKey(root)) : null
      const saved = raw ? JSON.parse(raw) : null
      if (saved && typeof saved.query === 'string' && Array.isArray(saved.types)) session = {
        query: saved.query.slice(0, 500), types: saved.types.filter((type: unknown) => typeof type === 'string').slice(0, 8),
        selected: typeof saved.selected === 'string' ? saved.selected : '', scroll: Number.isFinite(saved.scroll) ? Math.max(0, saved.scroll) : 0,
      }
    } catch { /* Keep unreadable data available for recovery. */ }
  }
  return session ? { ...session, types: [...session.types] } : undefined
}
export const restoreSearchSession = (root: string, session?: SearchSession) => {
  if (!session) { sessions.delete(root); persistSearchSession(root); return }
  sessions.set(root, { query: String(session.query || '').slice(0, 500), types: Array.isArray(session.types) ? session.types.filter(type => typeof type === 'string').slice(0, 8) : [], selected: '', scroll: 0 })
  persistSearchSession(root, sessions.get(root))
}
export function useSearchReturn(options: {
  root: () => string; query: Ref<string>; types: Ref<string[]>;
  running: Ref<boolean>; failed: Ref<boolean>; resultKeys: () => string[];
  viewport: Ref<HTMLElement | null>; showResults: () => void;
}) {
  const selectedKey = ref('')
  const notice = ref('')
  let scroll = 0, pending = false, focusResult = false, disposed = false
  const save = (root = options.root()) => {
    if (!root) return
    if (!options.query.value.trim()) { sessions.delete(root); persistSearchSession(root); return }
    if (!pending && !options.running.value && options.viewport.value) scroll = options.viewport.value.scrollTop
    sessions.delete(root)
    sessions.set(root, { query: options.query.value, types: [...options.types.value], selected: selectedKey.value, scroll })
    persistSearchSession(root, sessions.get(root))
    if (sessions.size > 8) sessions.delete(sessions.keys().next().value!)
  }
  const apply = async () => {
    if (!pending || options.running.value || options.failed.value || !options.viewport.value) return
    await nextTick()
    if (disposed || !pending || options.running.value || options.failed.value || !options.viewport.value) return
    const viewport = options.viewport.value
    viewport.scrollTop = scroll
    const result = Array.from(viewport.querySelectorAll<HTMLElement>('[data-search-key]')).find(item => item.dataset.searchKey === selectedKey.value)
    if (selectedKey.value && !result) {
      notice.value = '原来的结果已变化，已保留搜索条件，请从当前结果中选择。'
      selectedKey.value = ''
    } else if (result && focusResult) {
      result.scrollIntoView({ block: 'nearest' })
      result.querySelector<HTMLButtonElement>('.knowledge-result-open')?.focus({ preventScroll: true })
    }
    pending = false; focusResult = false
  }
  const remember = (key: string) => {
    selectedKey.value = key; notice.value = ''; pending = false
    scroll = options.viewport.value?.scrollTop ?? scroll
    save()
  }
  const restore = () => {
    const session = snapshotSearchSession(options.root())
    if (!session) return
    options.query.value = session.query
    options.types.value = [...session.types]
    selectedKey.value = session.selected; scroll = session.scroll
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
    selectedKey.value = ''; notice.value = ''; scroll = 0; pending = false
  }, { flush: 'sync', deep: true })
  watch(options.root, (_root, oldRoot) => {
    save(oldRoot)
    selectedKey.value = ''; notice.value = ''; scroll = 0; pending = false
  }, { flush: 'sync' })
  watch([options.viewport, options.running, options.failed, options.resultKeys], () => { void apply() }, { flush: 'post' })
  onBeforeUnmount(() => { save(); disposed = true })
  return { selectedKey, notice, remember, restore, returnToResults }
}
