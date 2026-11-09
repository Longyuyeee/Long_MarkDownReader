import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
export type CodeToolMode='symbols'|'cursor'|'indent'
export const codeTokens = [
  { value: '(', label: '(', name: '插入左圆括号' },
  { value: ')', label: ')', name: '插入右圆括号' },
  { value: ':', label: ':', name: '插入冒号' },
  { value: ',', label: ',', name: '插入逗号' },
  { value: '.', label: '.', name: '插入句点' },
  { value: '=', label: '=', name: '插入等号' },
  { value: '_', label: '_', name: '插入下划线' },
  { value: '>', label: '>', name: '插入大于号' },
  { value: '\t', label: 'Tab', name: '插入 Tab 制表符' },
  { value: '{}', label: '{}', name: '插入花括号对' },
  { value: '()', label: '()', name: '插入圆括号对' },
  { value: '[]', label: '[]', name: '插入方括号对' },
  { value: '""', label: '""', name: '插入双引号对' },
  { value: "''", label: "''", name: '插入单引号对' },
  { value: ';', label: ';', name: '插入分号' }
] as const
/** Insert around a selection rather than replacing it, retaining its source line endings. */
export function codeTokenChange(state: EditorState, token: string): TransactionSpec {
  if (!codeTokens.some(item => item.value === token)) throw new Error('未知的源码符号。')
  const range=state.selection.main,bom=state.doc.sliceString(0,1)==='\uFEFF'?1:0
  const from=Math.max(bom,range.from),to=Math.max(bom,range.to),anchor=Math.max(bom,range.anchor),head=Math.max(bom,range.head),pair = token.length === 2
  const changes = pair && from !== to ? [{ from, insert: token[0]! }, { from: to, insert: token[1]! }] : { from, to, insert: token }
  const selection = pair ? EditorSelection.single(from + 1 + (anchor > head ? to - from : 0), from + 1 + (anchor > head ? 0 : to - from)) : EditorSelection.single(from + token.length)
  return { changes, selection, annotations: isolateHistory.of('full'), userEvent: 'input.code-symbol', scrollIntoView: true }
}
export const codeLineCount = (source: string) => source.split(/\r\n|\r|\n/).length
/** Source offsets are UTF-16; CRLF is one line break and an initial BOM is skipped. */
export function codeLineOffset(source: string, input: string): number {
  if (!/^[1-9]\d{0,8}$/.test(input)) throw new Error('请输入从 1 开始的整数行号。')
  const target = Number(input)
  let line = 1, offset = source.startsWith('\uFEFF') ? 1 : 0
  if (target === 1) return offset
  for (const match of source.matchAll(/\r\n|\r|\n/g)) { line++; offset = match.index + match[0].length; if (line === target) return offset }
  throw new Error(`这份源码只有 ${line} 行，请核对行号。`)
}
