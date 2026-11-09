import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'

export type FormatKind = 'bold' | 'heading' | 'list' | 'quote'
/** All offsets are CodeMirror positions, including for CRLF source documents. */
export function formattingChange(state: EditorState, kind: FormatKind): TransactionSpec {
  const range = state.selection.main, bom = state.doc.sliceString(0, 1) === '\uFEFF' ? 1 : 0
  const from = Math.max(bom, range.from), to = Math.max(from, range.to)
  const annotations = isolateHistory.of('full')
  if (kind === 'bold') {
    const selected = state.sliceDoc(from, to)
    let start = from, end = to, text = selected || '文字'
    let changes: TransactionSpec['changes']
    let anchor: number, head: number
    if (selected.startsWith('**') && selected.endsWith('**') && selected.length > 4) {
      text = selected.slice(2, -2); anchor = start; head = start + state.toText(text).length
      changes = [{ from: start, to: start + 2 }, { from: end - 2, to: end }]
    } else if (from >= 2 && to + 2 <= state.doc.length && state.sliceDoc(from - 2, from) === '**' && state.sliceDoc(to, to + 2) === '**') {
      start -= 2; end += 2; anchor = start; head = start + state.toText(selected).length
      changes = [{ from: start, to: start + 2 }, { from: end - 2, to: end }]
    } else {
      anchor = start + 2; head = anchor + state.toText(text).length; text = `**${text}**`
      changes = selected ? [{ from, insert: '**' }, { from: to, insert: '**' }] : { from, to, insert: text }
    }
    return { changes, selection: EditorSelection.single(range.anchor <= range.head ? anchor : head, range.anchor <= range.head ? head : anchor), annotations, userEvent: 'input.format' }
  }
  const prefix = kind === 'heading' ? '## ' : kind === 'list' ? '- ' : '> '
  const pattern = kind === 'heading' ? /^#{1,6} / : kind === 'list' ? /^[-+*] / : /^> ?/
  const first = state.doc.lineAt(from).number, last = state.doc.lineAt(to > from && state.doc.lineAt(to).from === to ? to - 1 : to).number
  const lines = Array.from({ length: last - first + 1 }, (_, i) => state.doc.line(first + i))
  const visible = (line: typeof lines[number]) => line.text.slice(line.from === 0 ? bom : 0)
  const remove = lines.every(line => visible(line).startsWith(prefix))
  const changes = state.changes(lines.map(line => { const start = line.from + (line.from === 0 ? bom : 0); return { from: start, to: start + (pattern.exec(visible(line))?.[0].length || 0), insert: remove ? '' : prefix } }))
  return { changes, selection: EditorSelection.create(state.selection.ranges.map(range => EditorSelection.range(changes.mapPos(range.empty ? Math.max(bom, range.anchor) : range.anchor, 1), changes.mapPos(range.empty ? Math.max(bom, range.head) : range.head, 1))), state.selection.mainIndex), annotations, userEvent: 'input.format' }
}
