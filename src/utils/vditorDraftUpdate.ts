// Render an explicit draft transaction without scheduling a delayed input/history
// job. Preserve the previous DOM and history until exact Markdown is verified.
export function applyVditorDraftUpdate(editor: any, before: string, after: string) {
  if (editor.getValue() !== before) throw Error('笔记已有变化，请重新预览；未修改草稿')
  const mode = editor.getCurrentMode(), root = editor.vditor[mode]?.element as HTMLElement|undefined
  if (!root || !['wysiwyg','ir','sv'].includes(mode)) throw Error('编辑器尚未准备好，请稍后重试')
  const undo = editor.vditor.undo, state = undo[mode], history = {...state, undoStack:[...state.undoStack], redoStack:[...state.redoStack]}, html = root.innerHTML
  const caret = () => {
    const selection = window.getSelection()
    if (!selection) return
    if (selection.rangeCount && root.contains(selection.getRangeAt(0).startContainer)) return
    const range = document.createRange(); range.selectNodeContents(root); range.collapse(false)
    selection.removeAllRanges(); selection.addRange(range)
  }
  try {
    caret()
    undo.addToUndoStack(editor.vditor)
    root.innerHTML = mode === 'wysiwyg' ? editor.vditor.lute.Md2VditorDOM(after) : mode === 'ir' ? editor.vditor.lute.Md2VditorIRDOM(after) : `<div data-block="0">${editor.vditor.lute.SpinVditorSVDOM(after)}</div>`
    if (editor.getValue() !== after) throw Error('当前模式无法准确保留全部原文，草稿和撤销记录已恢复；可切换源码模式后重试')
    // Both checkpoints need a cursor bookmark: Vditor's redo expects one even
    // when the update was confirmed from a modal rather than the editor.
    window.getSelection()?.removeAllRanges(); caret()
    undo.addToUndoStack(editor.vditor)
    editor.vditor.preview?.render(editor.vditor)
  } catch (cause) {root.innerHTML = html; Object.assign(state,history); undo.resetIcon(editor.vditor); throw cause}
  clearTimeout(editor.vditor[mode].afterRenderTimeoutId)
  const popover = editor.vditor[mode].popover as HTMLElement|undefined
  if (popover) popover.style.display = 'none'
}
