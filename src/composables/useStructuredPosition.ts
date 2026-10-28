import { nextTick, onScopeDispose, watch } from 'vue'
import { EditorSelection, type Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { claimStructuredPosition, structuredPositionDigest } from '../services/structuredPositionState'
import { fileStylePathKey } from '../utils/fileDisplayStyles'

const digests = new WeakMap<Text, Promise<string>>()
const digest = (doc: Text) => {
  let value = digests.get(doc)
  if (!value) { value = structuredPositionDigest(doc.toString()).catch(() => ''); digests.set(doc, value) }
  return value
}
export function useStructuredPosition(options: {
  ready: () => boolean; panes?: () => Record<string, HTMLElement | null>
  enabled?: () => boolean
}) {
  let active: { editor: EditorView; tab: object; claim: ReturnType<typeof claimStructuredPosition>
    doc: Text; selection: EditorSelection; preserveReturn: boolean } | undefined
  let pending: (() => void) | undefined, detach = () => {}, ticket = 0
  let observer: ResizeObserver | undefined
  const observed = new Set<HTMLElement>()
  const observe = () => {
    if (!observer || !active) return
    const next = new Set([active?.editor.scrollDOM, ...Object.values(options.panes?.() || {})].filter((element): element is HTMLElement => !!element))
    for (const element of observed) if (!next.has(element)) { observer?.unobserve(element); observed.delete(element) }
    for (const element of next) if (!observed.has(element)) { observer?.observe(element); observed.add(element) }
  }
  let source: { top: number; left: number; snapshot?: ReturnType<EditorView['scrollSnapshot']> } = { top: 0, left: 0 }
  let sourceDoc: Text | undefined
  const cancel = () => { ticket++; pending = undefined; if (active) active.preserveReturn = false }
  const remember = () => {
    if (!active || !active.claim.current()) return
    const { editor, claim } = active
    // Closing another tab can briefly mount this file and immediately leave
    // again. Until the user positions it, retain the previous return point;
    // the temporary default cursor/scroll must not replace it during loading.
    if (active.preserveReturn && editor.state.doc === active.doc && editor.state.selection.eq(active.selection)) return
    if (editor.scrollDOM.clientHeight) {
      editor.lineBlockAtHeight(editor.scrollDOM.scrollTop)
      source = { top: editor.scrollDOM.scrollTop, left: editor.scrollDOM.scrollLeft, snapshot: editor.scrollSnapshot() }
      sourceDoc = editor.state.doc
    } else if (sourceDoc !== editor.state.doc) {
      // A tree edit can change a hidden source. Its old scroll target belongs
      // to different text; keep the current selection and let scrolling reset.
      source = { top: 0, left: 0 }
    }
    const panes = Object.fromEntries(Object.entries(options.panes?.() || {})
      .filter((entry): entry is [string, HTMLElement] => options.ready() && !!entry[1]?.clientHeight)
      .map(([key, element]) => [key, { top: element.scrollTop, left: element.scrollLeft }]))
    claim.remember({ digest: digest(editor.state.doc), ranges: editor.state.selection.ranges.map(({ anchor, head }) => ({ anchor, head })),
      mainIndex: editor.state.selection.mainIndex, source, panes })
  }
  const beforeReplace = () => { remember(); cancel(); detach(); active = undefined; sourceDoc = undefined }
  const bind = (editor: EditorView, tab: object, root: string, external: boolean, format: string) => {
    cancel(); detach(); active = undefined
    if (options.enabled?.() === false) return
    // setState reuses the scroll element. A new or changed file must not
    // inherit the previous file's pixels while it has no verified position.
    editor.scrollDOM.scrollTop = 0; editor.scrollDOM.scrollLeft = 0
    const claim = claimStructuredPosition(tab, JSON.stringify([fileStylePathKey(root), external, format]))
    active = { editor, tab, claim, doc: editor.state.doc, selection: editor.state.selection, preserveReturn: !!claim.position }
    source = { top: 0, left: 0 }; sourceDoc = editor.state.doc
    const scroll = () => { if (editor.scrollDOM.clientHeight) { source = { top: editor.scrollDOM.scrollTop, left: editor.scrollDOM.scrollLeft, snapshot: editor.scrollSnapshot() }; sourceDoc = editor.state.doc } }
    // New positioning input wins. Merely showing the source/inspector must
    // still restore its deferred position when that pane becomes visible.
    const input = (event: Event) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return
      if (event.type === 'keydown') {
        const key = event as KeyboardEvent
        if (['Control', 'Meta', 'Alt', 'Shift'].includes(key.key) || key.altKey
          || (key.ctrlKey || key.metaKey) && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key.key)) return
      }
      const target = event.target, paneInput = Object.values(options.panes?.() || {}).some(pane => pane?.contains(target))
      if (editor.dom.contains(target) || paneInput && (event.type === 'wheel' || target.closest('[data-outline-node],[role="treeitem"],[role="tree"]'))) cancel()
    }
    for (const type of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(type, input, true)
    editor.scrollDOM.addEventListener('scroll', scroll, { passive: true })
    observer = new ResizeObserver(() => pending?.()); observe()
    detach = () => {
      for (const type of ['pointerdown', 'keydown', 'wheel']) document.removeEventListener(type, input, true)
      editor.scrollDOM.removeEventListener('scroll', scroll); observer?.disconnect(); observer = undefined; observed.clear(); detach = () => {}
    }
    const point = claim.position, owner = ticket, doc = editor.state.doc, initialSelection = editor.state.selection
    if (!point) return
    void Promise.all([point.digest, digest(doc)]).then(([before, current]) => {
      if (!before || before !== current || ticket !== owner || !claim.current() || active?.editor !== editor || editor.state.doc !== doc || editor.state.selection !== initialSelection) {
        if (active?.claim === claim && ticket === owner) active.preserveReturn = false
        return
      }
      source = { ...point.source }
      let selection = false, scrolled = false, expectedSelection = initialSelection, width = 0, height = 0
      const restored = new Set<string>()
      pending = () => {
        if (ticket !== owner || !claim.current() || active?.editor !== editor || editor.state.doc !== doc || editor.state.selection !== expectedSelection) {
          if (active?.claim === claim && ticket === owner) active.preserveReturn = false
          pending = undefined; return
        }
        if (!selection) {
          if (!point.ranges.length || point.ranges.some(range => !Number.isInteger(range.anchor) || !Number.isInteger(range.head)
            || Math.min(range.anchor, range.head) < 0 || Math.max(range.anchor, range.head) > doc.length)) { active!.preserveReturn = false; pending = undefined; return }
          editor.dispatch({ selection: EditorSelection.create(point.ranges.map(range => EditorSelection.range(range.anchor, range.head)), point.mainIndex) })
          expectedSelection = editor.state.selection
          active!.selection = expectedSelection
          selection = true
        }
        // Source offsets are already verified against this exact document.
        // Do not leave a temporary default caret while analysis is pending.
        if (!options.ready()) return
        if (editor.scrollDOM.clientHeight && (!scrolled || width !== editor.scrollDOM.clientWidth || height !== editor.scrollDOM.clientHeight)) {
          // CodeMirror's snapshot stores a document anchor and its viewport
          // offset, so line wrapping/measurement does not shift the return.
          if (point.source.snapshot) editor.dispatch({ effects: point.source.snapshot })
          else editor.requestMeasure({ read: () => null, write: () => {
            if (ticket !== owner || editor.state.doc !== doc || !claim.current()) return
            editor.scrollDOM.scrollTop = point.source.top; editor.scrollDOM.scrollLeft = point.source.left; scroll()
          } })
          scrolled = true; width = editor.scrollDOM.clientWidth; height = editor.scrollDOM.clientHeight
        }
        for (const [key, position] of Object.entries(point.panes)) {
          const pane = options.panes?.()[key]
          if (!pane?.clientHeight || restored.has(key)) continue
          pane.scrollTop = position.top; pane.scrollLeft = position.left; restored.add(key)
        }
        if (scrolled && Object.keys(point.panes).every(key => restored.has(key))) pending = undefined
      }
      void nextTick(() => pending?.())
    })
  }
  // Analysis, TOML expanded children and JSON's tree can arrive after bind.
  watch(() => [options.ready(), ...Object.values(options.panes?.() || {})], () => { void nextTick(() => { observe(); pending?.() }) }, { flush: 'post' })
  onScopeDispose(() => { beforeReplace() })
  return { remember, beforeReplace, bind }
}
