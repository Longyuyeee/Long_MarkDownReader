import { computed, onScopeDispose, reactive, ref, watch } from 'vue'

const drafts = reactive(new Map<symbol, boolean>())
const pendingSaves = ref(0)
const snapshots = new Set<() => void>()
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
export const beginWindowSave = () => {
  pendingSaves.value++
  recordWindowDraftActivity()
  let released = false
  return () => {
    if (released) return
    released = true
    pendingSaves.value--
    recordWindowDraftActivity()
  }
}

// Editors with local draft models participate in native close and update guards.
export const useWindowDraft = (isDirty: () => boolean) => {
  const key = Symbol('editor draft')
  // A second editor can change while the aggregate dirty boolean stays true.
  // Keep activity reads in the callback, not a watchEffect dependency.
  watch(isDirty, dirty => {
    drafts.set(key, dirty)
    recordWindowDraftActivity()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    drafts.delete(key)
    recordWindowDraftActivity()
  })
}
