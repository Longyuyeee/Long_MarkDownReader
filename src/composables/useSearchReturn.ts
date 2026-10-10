import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'

interface SearchSession { query: string; types: string[]; selected: string; scroll: number }
// Only the current app session; no stale results or document text are persisted.
const sessions = new Map<string, SearchSession>()
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
    if (!options.query.value.trim()) { sessions.delete(root); return }
    if (!pending && !options.running.value && options.viewport.value) scroll = options.viewport.value.scrollTop
    sessions.delete(root)
    sessions.set(root, { query: options.query.value, types: [...options.types.value], selected: selectedKey.value, scroll })
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
    const session = sessions.get(options.root())
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
