import { computed, shallowRef, watch } from 'vue'
import type { TabInfo } from '../store/app'
import type { MarkdownPosition } from '../utils/markdownEditorSession'
import { sameWorkspacePath } from '../utils/savedCollections.ts'

export function useLinkSourceReturn(options: { root: () => string; tabs: () => TabInfo[]; active: () => string | null }) {
  type Entry = { root: string; source: TabInfo; target: TabInfo; position: MarkdownPosition; revision: string | undefined }
  const entries = shallowRef<Entry[]>([])
  const valid = (entry: Entry) => sameWorkspacePath(entry.root, options.root()) && options.tabs().includes(entry.source)
    && options.tabs().includes(entry.target) && entry.source.content === entry.revision
  watch(() => [options.root(), ...options.tabs()], () => { entries.value = entries.value.filter(valid) }, { flush: 'sync' })
  const current = computed(() => [...entries.value].reverse().find(entry => valid(entry) && entry.target.id === options.active()))
  return {
    current,
    push(source: TabInfo, target: TabInfo, position: MarkdownPosition) {
      if (source === target) return
      entries.value = [...entries.value.filter(valid), { root: options.root(), source, target, position, revision: source.content }].slice(-20)
    },
    consume(entry: Entry) { const index = entries.value.indexOf(entry); if (index >= 0) entries.value = entries.value.slice(0, index) },
    invalidate(tab: TabInfo) { entries.value = entries.value.filter(entry => entry.source !== tab && entry.target !== tab) },
  }
}
