import { computed, onScopeDispose, reactive, watchEffect } from 'vue'

const drafts = reactive(new Map<symbol, boolean>())
export const windowDraftCount = computed(() => [...drafts.values()].filter(Boolean).length)

// Editors with local draft models participate in native close and update guards.
export const useWindowDraft = (isDirty: () => boolean) => {
  const key = Symbol('editor draft')
  watchEffect(() => { drafts.set(key, isDirty()) }, { flush: 'sync' })
  onScopeDispose(() => { drafts.delete(key) })
}
