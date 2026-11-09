import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorState, EditorSelection } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'
import { formattingChange } from '../src/mobile/editorCommands.ts'
import { sourceFormat, sourceSlice, adoptSourceFormat } from '../src/mobile/sourceFormat.ts'
import { sourceSelection, sourceRangeChange } from '../src/mobile/editorOffsets.ts'

const editor = (doc, anchor, head = anchor) => EditorState.create({ doc, selection: EditorSelection.single(anchor, head), extensions: [history(), EditorState.lineSeparator.of(doc.includes('\r\n') ? '\r\n' : '\n')] })
test('Heading acts on complete touched lines and excludes the next line at the selection boundary', () => {
  let state = editor('Alpha\nBeta\nGamma', 2, 11)
  state = state.update(formattingChange(state, 'heading')).state
  assert.equal(state.sliceDoc(), '## Alpha\n## Beta\nGamma')
  state = state.update(formattingChange(state, 'heading')).state
  assert.equal(state.sliceDoc(), 'Alpha\nBeta\nGamma')
})
test('List and quote preserve CRLF, Chinese, emoji and backward selections', () => {
  let state = editor('中文😀\r\n第二行\r\n末行', 8, 0)
  state = state.update(formattingChange(state, 'list')).state
  assert.equal(state.sliceDoc(), '- 中文😀\r\n- 第二行\r\n末行')
  assert.ok(state.selection.main.anchor > state.selection.main.head)
  state = state.update(formattingChange(state, 'list')).state
  assert.equal(state.sliceDoc(), '中文😀\r\n第二行\r\n末行')
  state = state.update(formattingChange(state, 'quote')).state
  assert.equal(state.sliceDoc(), '> 中文😀\r\n> 第二行\r\n末行')
})
test('Existing headings and alternate list markers normalize once; caret stays with its text', () => {
  let state = editor('### 标题\n+ 项目', 4)
  state = state.update(formattingChange(state, 'heading')).state
  assert.equal(state.sliceDoc(), '## 标题\n+ 项目'); assert.equal(state.selection.main.head, 3)
  state = state.update({ selection: { anchor: state.doc.length } }).state
  state = state.update(formattingChange(state, 'list')).state
  assert.equal(state.sliceDoc(), '## 标题\n- 项目')
})
test('Bold selects the written text, toggles without nesting, and provides a selected placeholder', () => {
  let state = editor('中文😀', 0, 4)
  state = state.update(formattingChange(state, 'bold')).state
  assert.equal(state.sliceDoc(), '**中文😀**'); assert.equal(state.sliceDoc(state.selection.main.from, state.selection.main.to), '中文😀')
  state = state.update(formattingChange(state, 'bold')).state
  assert.equal(state.sliceDoc(), '中文😀')
  state = editor('', 0).update(formattingChange(editor('', 0), 'bold')).state
  assert.equal(state.sliceDoc(), '**文字**'); assert.equal(state.sliceDoc(state.selection.main.from, state.selection.main.to), '文字')
})
test('Formats undo independently to the prior selection, and redo restores the content', () => {
  let state = editor('原文', 1)
  const dispatch = transaction => { state = transaction.state }
  state = state.update(formattingChange(state, 'heading')).state
  state = state.update(formattingChange(state, 'bold')).state
  const formatted = state.sliceDoc()
  assert.ok(undo({ get state() { return state }, dispatch })); assert.equal(state.sliceDoc(), '## 原文')
  assert.ok(undo({ get state() { return state }, dispatch })); assert.equal(state.sliceDoc(), '原文')
  assert.equal(state.selection.main.head, 1)
  assert.ok(redo({ get state() { return state }, dispatch })); assert.ok(redo({ get state() { return state }, dispatch }))
  assert.equal(state.sliceDoc(), formatted); assert.ok(state.selection.main.head <= state.doc.length)
})
test('IME-style LF and pasted CRLF become structural lines while source retains its CRLF format', () => {
  let state = EditorState.create({ doc: '甲\r\n乙', extensions: [sourceFormat('甲\r\n乙')] })
  state = state.update({ changes: { from: state.doc.length, insert: '\n中文\r\n下一行' } }).state
  assert.equal(state.doc.lines, 4); assert.equal(sourceSlice(state), '甲\r\n乙\r\n中文\r\n下一行')
  const raw = sourceSlice(state), range = sourceSelection(state, 4, state.doc.length)
  assert.equal(raw.slice(range.from, range.to), '中文\r\n下一行')
  state = state.update(sourceRangeChange(state, raw, range.from, range.to, '替换\r\n文字')).state
  assert.equal(sourceSlice(state), '甲\r\n乙\r\n替换\r\n文字')
})
test('Existing mixed separators survive nearby typing and multiline bold without normalizing the whole source', () => {
  const original = '甲\r\n乙\n丙\r丁'
  let state = EditorState.create({ doc: original, extensions: [sourceFormat(original)] })
  state = state.update({ changes: { from: 0, insert: '新增' } }).state
  assert.equal(sourceSlice(state), '新增' + original)
  state = state.update({ selection: { anchor: 0, head: state.doc.length } }).state
  state = state.update(formattingChange(state, 'bold')).state
  assert.equal(sourceSlice(state), '**新增' + original + '**')
  state = state.update(formattingChange(state, 'bold')).state
  assert.equal(sourceSlice(state), '新增' + original)
})
test('Deleting a nonpreferred separator and undo/redo restores its original spelling', () => {
  const original = '甲\r\n乙\n丙\r丁'
  let state = EditorState.create({ doc: original, extensions: [history(), sourceFormat(original)] })
  const dispatch = transaction => { state = transaction.state }
  state = state.update({ changes: { from: 3, to: 4 }, userEvent: 'delete' }).state
  assert.equal(sourceSlice(state), '甲\r\n乙丙\r丁')
  assert.ok(undo({ get state() { return state }, dispatch })); assert.equal(sourceSlice(state), original)
  assert.ok(redo({ get state() { return state }, dispatch })); assert.equal(sourceSlice(state), '甲\r\n乙丙\r丁')
})
test('Replacing incoming recovery source adopts its separators and undo restores the previous source format', () => {
  let state = EditorState.create({ doc: '原文\r\n正文', extensions: [history(), sourceFormat('原文\r\n正文')] })
  const dispatch = transaction => { state = transaction.state }, recovered = '恢复\n内容\r结尾'
  state = state.update({ changes: { from: 0, to: state.doc.length, insert: state.toText(recovered) }, effects: adoptSourceFormat(recovered) }).state
  assert.equal(sourceSlice(state), recovered)
  assert.ok(undo({ get state() { return state }, dispatch })); assert.equal(sourceSlice(state), '原文\r\n正文')
})
test('Grouped typing before mixed separators undoes and redoes their exact positions together', () => {
  const original = '甲\r\n乙\n丙\r丁'
  let state = EditorState.create({ doc: original, extensions: [history(), sourceFormat(original)] })
  const dispatch = transaction => { state = transaction.state }
  state = state.update({ changes: { from: 0, insert: 'A' }, selection: { anchor: 1 }, userEvent: 'input.type' }).state
  state = state.update({ changes: { from: 1, insert: 'B' }, selection: { anchor: 2 }, userEvent: 'input.type' }).state
  assert.equal(sourceSlice(state), 'AB' + original)
  assert.ok(undo({ get state() { return state }, dispatch })); assert.equal(sourceSlice(state), original)
  assert.ok(redo({ get state() { return state }, dispatch })); assert.equal(sourceSlice(state), 'AB' + original)
})
