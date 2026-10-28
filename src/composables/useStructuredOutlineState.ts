import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { claimStructuredOutlineState, type StructuredOutlineState } from '../services/structuredOutlineState'
import { fileStylePathKey } from '../utils/fileDisplayStyles'

export function useStructuredOutlineState(options: {
  tab: () => object | undefined; path: () => string; root: () => string
  external: () => boolean; format: () => string
}) {
  const query = ref(''), selection = shallowRef<string>(), expanded = shallowRef<string[]>([])
  const mode = ref<'source' | 'tree'>('source'), collapsed = shallowRef<string[]>(), treeSelection = shallowRef<string>()
  const revision = ref(0)
  let claim: ReturnType<typeof claimStructuredOutlineState> | undefined, hydrating = false, pending = ''
  const snapshot = (): StructuredOutlineState => ({ query: query.value, selection: selection.value, expanded: expanded.value,
    mode: mode.value, collapsed: collapsed.value, treeSelection: treeSelection.value })
  watch([options.tab, options.path, options.root, options.external, options.format] as const, ([tab, path, root, external, format]) => {
    const scope = JSON.stringify([fileStylePathKey(root), external, format])
    const pendingKey = scope + '\0' + fileStylePathKey(path)
    const seed = pending === pendingKey ? snapshot() : undefined
    claim = tab ? claimStructuredOutlineState(tab, scope, seed) : undefined
    const state: StructuredOutlineState = claim?.state || { query: '', expanded: [], mode: 'source' }
    hydrating = true
    query.value = state.query; selection.value = state.selection; expanded.value = state.expanded
    mode.value = state.mode; collapsed.value = state.collapsed; treeSelection.value = state.treeSelection
    hydrating = false; pending = tab ? '' : pendingKey; revision.value++
  }, { flush: 'sync', immediate: true })
  watch([query, selection, expanded, mode, collapsed, treeSelection], () => {
    if (!hydrating) claim?.remember(snapshot())
  }, { flush: 'sync' })
  onScopeDispose(() => { claim = undefined })
  return { query, selection, expanded, mode, collapsed, treeSelection, revision }
}
