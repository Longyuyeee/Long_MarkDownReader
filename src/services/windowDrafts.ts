import { computed, onScopeDispose, reactive, ref, watchEffect } from 'vue'

const drafts = reactive(new Map<symbol, boolean>())
const pendingSaves = ref(0)
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
  watchEffect(() => { drafts.set(key, isDirty()) }, { flush: 'sync' })
  onScopeDispose(() => { drafts.delete(key) })
}
