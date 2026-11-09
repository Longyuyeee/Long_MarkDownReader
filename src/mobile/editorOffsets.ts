import type { EditorState } from '@codemirror/state'
import { sourceSlice } from './sourceFormat.ts'
type TextState = EditorState
/** CodeMirror positions count a line break once; source strings may use CRLF. */
export function sourceSelection(state: TextState, from: number, to: number) {
  return { from: sourceSlice(state, 0, from).length, to: sourceSlice(state, 0, to).length }
}
export function sourceRangeChange(state: TextState, expected: string, from: number, to: number, text: string) {
  if (sourceSlice(state) !== expected || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > expected.length) throw new Error('正文已变化，图片已导入但尚未插入，请重新打开图片面板。')
  const start = state.toText(expected.slice(0, from)).length, end = state.toText(expected.slice(0, to)).length, insert = state.toText(text)
  return { changes: { from: start, to: end, insert }, selection: { anchor: start + insert.length }, scrollIntoView: true }
}
