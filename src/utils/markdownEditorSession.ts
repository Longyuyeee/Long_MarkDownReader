type Mode = 'wysiwyg' | 'ir' | 'sv'
interface Point { path: number[]; offset: number; textOffset: number }
export interface MarkdownPosition {
  mode: Mode; content: string; top: number; left: number
  selection?: { anchor: Point; focus: Point; text: string }
}
export interface MarkdownEditorSession {
  position: MarkdownPosition
  baseline: string | null
  undo: Record<Mode, unknown>
}
const modes: Mode[] = ['wysiwyg', 'ir', 'sv']
const rootFor = (editor: any) => editor?.vditor?.[editor.getCurrentMode()]?.element as HTMLElement | undefined
const point = (root: HTMLElement, node: Node, offset: number): Point => {
  const path: number[] = []
  for (let at: Node = node; at !== root; at = at.parentNode!) path.unshift(Array.prototype.indexOf.call(at.parentNode!.childNodes, at))
  const range = document.createRange(); range.selectNodeContents(root); range.setEnd(node, offset)
  return { path, offset, textOffset: range.toString().length }
}
export function captureMarkdownPosition(editor: any, range?: Range): MarkdownPosition | undefined {
  const root = rootFor(editor)
  if (!root) return
  const position: MarkdownPosition = { mode: editor.getCurrentMode(), content: editor.getValue(), top: root.scrollTop, left: root.scrollLeft }
  const selection = window.getSelection()
  const anchor = range?.startContainer || selection?.anchorNode, focus = range?.endContainer || selection?.focusNode
  if (anchor && focus && root.contains(anchor) && root.contains(focus)) position.selection = {
    anchor: point(root, anchor, range?.startOffset ?? selection!.anchorOffset),
    focus: point(root, focus, range?.endOffset ?? selection!.focusOffset), text: root.textContent || '',
  }
  return position
}
function resolve(root: HTMLElement, saved: Point): [Node, number] | undefined {
  let node: Node = root
  for (const index of saved.path) { if (!node.childNodes[index]) { node = root; break }; node = node.childNodes[index] }
  const max = node.nodeType === Node.TEXT_NODE ? node.textContent!.length : node.childNodes.length
  if (saved.offset <= max) {
    const range = document.createRange(); range.selectNodeContents(root); range.setEnd(node, saved.offset)
    if (range.toString().length === saved.textOffset) return [node, saved.offset]
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let at = 0
  while ((node = walker.nextNode()!)) { const size = node.textContent?.length || 0; if (saved.textOffset <= at + size) return [node, saved.textOffset - at]; at += size }
}
export function restoreMarkdownPosition(editor: any, saved: MarkdownPosition, focus = false) {
  const root = rootFor(editor)
  if (!root || editor.getCurrentMode() !== saved.mode || editor.getValue() !== saved.content) return false
  if (focus) root.focus({ preventScroll: true })
  if (saved.selection && root.textContent === saved.selection.text) {
    const anchor = resolve(root, saved.selection.anchor), end = resolve(root, saved.selection.focus)
    if (anchor && end) window.getSelection()?.setBaseAndExtent(...anchor, ...end)
  }
  root.scrollTop = saved.top; root.scrollLeft = saved.left
  return true
}
export function captureMarkdownSession(editor: any, baseline: string | null): MarkdownEditorSession | undefined {
  const position = captureMarkdownPosition(editor), undo = editor?.vditor?.undo
  if (!position || !undo) return
  // Flush the pending input into this document before transferring its stacks.
  // A changed caret alone must not become another Undo step on navigation.
  const last = undo[position.mode].lastText.replace(/<wbr\s*\/?\s*>/g, '')
  const lute = editor.vditor.lute
  let previous: string
  if (position.mode === 'sv') {
    const clone = document.createElement('div'); clone.innerHTML = last
    previous = `${clone.textContent}\n`.replace(/\n\n$/, '\n').replace(/\u00a0/g, ' ')
  } else previous = position.mode === 'ir' ? lute.VditorIRDOM2Md(last) : lute.VditorDOM2Md(last)
  if (previous !== position.content) undo.addToUndoStack(editor.vditor)
  for (const mode of modes) {
    clearTimeout(editor.vditor[mode]?.processTimeoutId)
    clearTimeout(editor.vditor[mode]?.hlToolbarTimeoutId)
  }
  return { position, baseline, undo: Object.fromEntries(modes.map(mode => [mode, undo[mode]])) as Record<Mode, unknown> }
}
export function restoreMarkdownSession(editor: any, saved: MarkdownEditorSession) {
  if (editor.getCurrentMode() !== saved.position.mode || editor.getValue() !== saved.position.content) return false
  for (const mode of modes) {
    clearTimeout(editor.vditor[mode]?.processTimeoutId)
    editor.vditor.undo[mode] = saved.undo[mode]
  }
  editor.vditor.undo.resetIcon(editor.vditor)
  return true
}
