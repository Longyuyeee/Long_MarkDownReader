import { EditorSelection, countColumn, type EditorState, type TransactionSpec } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'

export type CodeLineAction = 'left' | 'right' | 'start' | 'end' | 'select' | 'indent' | 'outdent'
/** A selection ending at the next line's start does not include that line. */
export function codeSelectedLines(state: EditorState) {
  const { from, to, empty } = state.selection.main
  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(!empty && to > from && state.doc.lineAt(to).from === to ? to - 1 : to).number
  return { first, last }
}
export function codePosition(state: EditorState) {
  const { first, last } = codeSelectedLines(state)
  const at=state.selection.main.head,line=state.doc.lineAt(at),rawPrefix=line.text.slice(0,at-line.from),prefix=line.number===1?rawPrefix.replace(/^\uFEFF/,''):rawPrefix
  return { line: line.number,column:countColumn(prefix,state.tabSize)+1, selectedLines: state.selection.main.empty ? 0 : last - first + 1 }
}
export function codeLineSelection(state: EditorState, action: 'start' | 'end' | 'select'): TransactionSpec {
  const range = state.selection.main, { first, last } = codeSelectedLines(state)
  const at = state.doc.lineAt(range.head), bom = state.doc.sliceString(0, 1) === '\uFEFF' ? 1 : 0
  const from = Math.max(bom, state.doc.line(first).from), to = state.doc.line(last).to
  const selection = action === 'select' ? EditorSelection.single(range.anchor > range.head ? to : from, range.anchor > range.head ? from : to) : EditorSelection.cursor(action === 'start' ? Math.max(bom, at.from) : at.to)
  return { selection, scrollIntoView: true, userEvent: 'select.code-line' }
}
/** Deliberate per-line whitespace edits; untouched BOM and EOL mappings survive. */
export function codeIndentChange(state: EditorState, outdent = false): TransactionSpec | undefined {
  const { first, last } = codeSelectedLines(state)
  if (last - first + 1 > 1000) throw new Error('一次最多调整 1000 行缩进，请缩小选区后重试。')
  const edits: { from: number; to?: number; insert: string }[] = []
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n), start = line.from + (n === 1 && line.text.startsWith('\uFEFF') ? 1 : 0)
    const leading = line.text.slice(start - line.from)
    if (!outdent) edits.push({ from: start, insert: '  ' })
    else { const amount = leading.startsWith('\t') ? 1 : /^ {1,2}/.exec(leading)?.[0].length || 0; if (amount) edits.push({ from: start, to: start + amount, insert: '' }) }
  }
  if (!edits.length) return
  const changes = state.changes(edits)
  return { changes, selection: state.selection.map(changes, 1), annotations: isolateHistory.of('full'), userEvent: 'input.code-indent', scrollIntoView: true }
}
