import { computed, nextTick, shallowRef, watch } from 'vue'
import '../styles/source-outline-navigation.scss'

interface Entry { path: string; start: number; end: number; depth: number; field?: { start: number } }

// Navigation belongs to these row buttons, never to a window-level shortcut.
// Semantic identities survive offset changes; ranges always come from the
// latest accepted analysis, so an old result cannot locate into a newer draft.
export function useSourceOutlineNavigation<T extends Entry>(options: {
  entries: () => readonly T[]; visible: () => readonly T[]
  identity: () => string; ready: () => boolean
  key?: (entry: T) => string; preferredOffset?: () => number | undefined
}) {
  const element = shallowRef<HTMLElement | null>(null)
  const selectedKey = shallowRef<string>()
  const baseKey = options.key || ((entry: T) => entry.path)
  const keyCache = new WeakMap<T, string>()
  const keys = computed(() => {
    const counts = new Map<string, number>()
    for (const entry of options.entries()) {
      const base = baseKey(entry), ordinal = counts.get(base) || 0
      counts.set(base, ordinal + 1); keyCache.set(entry, base + '::' + ordinal)
    }
    return counts
  })
  const key = (entry: T) => { void keys.value; return keyCache.get(entry) || baseKey(entry) + '::0' }
  let previous: readonly T[] = [], pendingOffset = false
  let acceptedIdentity: string | undefined, pendingFocusOwner: string | undefined
  const selected = computed(() => options.entries().find(entry => key(entry) === selectedKey.value))
  const select = (entry: T) => {
    if (acceptedIdentity !== options.identity() && !options.ready()) return
    selectedKey.value = key(entry)
  }
  const selectRange = (range: { start: number; end: number }) => {
    const entries = options.entries()
    const entry = entries.find(entry => entry === range)
      || entries.find(entry => entry.field?.start === range.start)
      || entries.find(entry => entry.start === range.start && entry.end === range.end)
    if (entry) select(entry)
  }
  const tabEntry = computed(() => options.visible().find(item => key(item) === selectedKey.value) || options.visible()[0])
  const tabIndex = (entry: T) => tabEntry.value === entry ? 0 : -1
  const focus = (entry: T) => {
    const row = Array.from(element.value?.querySelectorAll<HTMLElement>('[data-outline-node]') || [])
      .find(row => row.dataset.outlineNode === key(entry))
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  const keydown = (event: KeyboardEvent, entry: T) => {
    if (event.target !== event.currentTarget || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !options.ready()) return
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const rows = options.visible(), index = rows.indexOf(entry)
    if (index < 0 || !rows.length) return
    event.preventDefault(); event.stopPropagation()
    const next = rows[event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
      : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    select(next); focus(next)
  }
  watch(options.identity, () => { selectedKey.value = undefined; previous = []; pendingOffset = false; acceptedIdentity = undefined; pendingFocusOwner = undefined }, { flush: 'sync' })
  if (options.preferredOffset) watch(options.preferredOffset, value => { if (value !== undefined) pendingOffset = true }, { flush: 'sync' })
  watch([options.entries, options.visible, options.ready], () => {
    const owner = options.identity()
    const rowFocused = !!element.value?.contains(document.activeElement)
      && (document.activeElement as HTMLElement)?.hasAttribute('data-outline-node')
    // JSON may update its paths before asynchronous schema analysis settles.
    // Remember focus before that first render replaces offset-keyed rows.
    if (!options.ready()) {
      if (rowFocused && acceptedIdentity === owner) pendingFocusOwner = owner
      return
    }
    const entries = options.entries(), visible = options.visible()
    const hadFocus = rowFocused && acceptedIdentity === owner || pendingFocusOwner === owner
    pendingFocusOwner = undefined; acceptedIdentity = owner
    const offset = options.preferredOffset?.()
    const preferred = pendingOffset && offset !== undefined
      ? entries.find(entry => entry.field?.start === offset) || entries.find(entry => entry.start === offset) : undefined
    pendingOffset = false
    if (preferred) select(preferred)
    else if (selectedKey.value && !selected.value && entries.length) {
      const index = previous.findIndex(entry => key(entry) === selectedKey.value), old = previous[index]
      const current = new Map(entries.map(entry => [key(entry), entry]))
      // Use the preceding outline hierarchy, not punctuation in user keys.
      let next: T | undefined, prior: T | undefined, parent: T | undefined
      if (old) {
        for (let i = index + 1; i < previous.length && previous[i].depth >= old.depth; i++) {
          if (previous[i].depth === old.depth && current.has(key(previous[i]))) { next = current.get(key(previous[i])); break }
        }
        for (let i = index - 1; i >= 0; i--) {
          if (previous[i].depth < old.depth) { parent = current.get(key(previous[i])); break }
          if (previous[i].depth === old.depth && current.has(key(previous[i]))) { prior = current.get(key(previous[i])); break }
        }
      }
      select(next || prior || parent || entries[Math.min(Math.max(0, index), entries.length - 1)])
    } else if (!entries.length) selectedKey.value = undefined
    previous = entries
    if (hadFocus) void nextTick(() => {
      if (!options.ready() || options.identity() !== owner || !element.value?.isConnected) return
      // Do not take focus back from the editor, a filter or an open dialog.
      if (document.activeElement !== document.body && !element.value.contains(document.activeElement)) return
      const current = visible.find(entry => key(entry) === selectedKey.value) || visible[0]
      if (current) { select(current); focus(current) }
    })
  }, { flush: 'pre' })
  return { element, selected, key, select, selectRange, tabIndex, keydown }
}
