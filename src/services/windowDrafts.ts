import { computed, onScopeDispose, reactive, ref, watch } from 'vue'

const drafts = reactive(new Map<symbol, boolean>())
const pendingSaves = ref(0)
export const pendingDocumentSaves = ref(0)
const documentDrafts = new Map<symbol, { dirty: () => boolean; path: () => string }>()
export const dirtyDocumentPaths = () => [...documentDrafts.values()].filter(item => item.dirty()).map(item => item.path()).filter(Boolean)
const snapshots = new Set<() => void>()
const referenceDrafts = new Set<() => { path: string; content?: string } | null>()
export const useWindowReferenceDraft = (read: () => { path: string; content?: string } | null) => {
  referenceDrafts.add(read)
  onScopeDispose(() => referenceDrafts.delete(read))
}
export const windowReferenceDrafts = () => [...referenceDrafts].flatMap(read => { const draft = read(); return draft ? [draft] : [] })
export const useWindowDraftSnapshot = (capture: () => void) => {
  snapshots.add(capture)
  onScopeDispose(() => snapshots.delete(capture))
}
export const snapshotWindowDrafts = () => { for (const capture of snapshots) capture() }
export const windowDraftCount = computed(() => [...drafts.values()].filter(Boolean).length + pendingSaves.value)
export const windowDraftActivity = ref(0)
export const recordWindowDraftActivity = () => {
  if (windowDraftActivity.value >= Number.MAX_SAFE_INTEGER) throw new Error('窗口编辑版本已耗尽，请保留草稿并重新打开窗口')
  windowDraftActivity.value++
}

// The native write outlives a route component; release only when it settles.
export const beginWindowSave = (kind: 'save' | 'relocation' = 'save') => {
  pendingSaves.value++
  if (kind === 'save') pendingDocumentSaves.value++
  recordWindowDraftActivity()
  let released = false
  return () => {
    if (released) return
    released = true
    pendingSaves.value--
    if (kind === 'save') pendingDocumentSaves.value--
    recordWindowDraftActivity()
  }
}

// Editors with local draft models participate in native close and update guards.
export const useWindowDraft = (isDirty: () => boolean, path?: () => string) => {
  const key = Symbol('editor draft')
  if (path) documentDrafts.set(key, { dirty: isDirty, path })
  // A second editor can change while the aggregate dirty boolean stays true.
  // Keep activity reads in the callback, not a watchEffect dependency.
  watch(isDirty, dirty => {
    drafts.set(key, dirty)
    recordWindowDraftActivity()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    drafts.delete(key)
    documentDrafts.delete(key)
    recordWindowDraftActivity()
  })
}
