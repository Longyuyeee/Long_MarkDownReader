// Repair link destinations in place. Re-rendering the whole document schedules
// Vditor's delayed history entry, which can consume the user's first Undo.
export function applyVditorSourceRepair(editor: any, original: string, href: string, nextHref: string, content: string, count: number) {
  if (editor.getValue() !== original) throw Error('笔记已变化，未修改来源链接')
  const mode = editor.getCurrentMode(), root = editor.vditor[mode]?.element as HTMLElement | undefined
  if (!root || !['wysiwyg', 'ir', 'sv'].includes(mode)) throw Error('当前编辑模式无法准确更新来源，请手动调整；草稿未改动')
  const excluded = 'pre, code, [data-type="code-block"], .vditor-ir__preview, .vditor-wysiwyg__preview'
  // Vditor's editable root is itself a <pre>; exclude only nested code blocks.
  const outsideCode = (node: Element) => { const container = node.closest(excluded); return !container || container === root }
  const anchors = [...root.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(node => node.getAttribute('href') === href && outsideCode(node))
  const markers = mode === 'wysiwyg' ? [] : [...root.querySelectorAll<HTMLElement>(mode === 'ir' ? '.vditor-ir__marker--link' : '.vditor-sv__marker--link')].filter(node => node.textContent === href && outsideCode(node))
  if ((mode === 'wysiwyg' ? anchors.length : markers.length) !== count) throw Error('当前模式无法准确对应这些来源链接，请手动调整；草稿未改动')
  const undo = editor.vditor.undo, state = undo[mode], history = { ...state, undoStack: [...state.undoStack], redoStack: [...state.redoStack] }
  const previous = markers.map(node => ({ node, html: node.innerHTML }))
  try {
    undo.addToUndoStack(editor.vditor)
    anchors.forEach(node => node.setAttribute('href', nextHref))
    markers.forEach(node => { node.textContent = nextHref })
    if (editor.getValue() !== content) throw Error('当前模式未能准确保留其他内容，原稿和撤销记录已恢复')
    undo.addToUndoStack(editor.vditor)
    // Refresh a visible read-only preview without re-rendering the editable DOM.
    editor.vditor.preview?.render(editor.vditor)
  } catch (cause) {
    anchors.forEach(node => node.setAttribute('href', href))
    previous.forEach(({ node, html }) => { node.innerHTML = html })
    Object.assign(state, history); undo.resetIcon(editor.vditor)
    throw cause
  }
  // The caller publishes the complete live draft. A render queued before the
  // dialog must not append another checkpoint after this explicit transaction.
  clearTimeout(editor.vditor[mode].afterRenderTimeoutId)
  const popover = editor.vditor[mode].popover as HTMLElement | undefined
  if (popover) popover.style.display = 'none'
}
