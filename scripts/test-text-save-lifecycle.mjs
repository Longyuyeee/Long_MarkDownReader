import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { test } from 'node:test'

const source = fs.readFileSync('src/views/TextEditorView.vue', 'utf8')
const helper = fs.readFileSync('src/utils/pendingTextSaves.ts', 'utf8').replaceAll('export ', '')
function harness(viewSource = source) {
  let resolve, reject
  const reply = new Promise((a, b) => { resolve = a; reject = b })
  const tab = { path: 'meeting.txt', content: '客户确认周五交付', isDirty: true, textSaveEncoding: 'utf-8', textSaveBom: 'none', textSaveLineEnding: 'lf', textSaveFinalNewline: false }
  const errors = [], applied = []
  const box = value => ({ value })
  const ctx = vm.createContext({
    editor: { state: { doc: { toString: () => tab.content } } }, loadGeneration: 1,
    readOnly: box(false), dirty: box(true), saving: box(false), format: box({ id: 'txt' }),
    textPath: box('meeting.txt'), isExternal: box(false), store: { tabs: [tab], libraryPath: 'library' },
    signature: box('old'), saveEncoding: box('utf-8'), saveBom: box('none'), saveLineEnding: box('lf'), saveFinalNewline: box(false),
    fileSize: box(0), modified: box(0), sourceEncoding: box('utf-8'),
    invoke: () => reply, applySnapshot: snapshot => applied.push(snapshot), syncCurrentTab: () => {},
    message: { success() {}, error: e => errors.push(e) }, dialog: { warning: e => errors.push(e) }, errorMessage: e => e.message,
  })
  const start = viewSource.indexOf('const save = async () => {')
  const end = viewSource.indexOf('const reloadCurrentEncoding', start)
  assert.ok(start > 0 && end > start)
  const script = helper + '\n' + viewSource.slice(start, end) + '\nglobalThis.saveAction = save; globalThis.waitAction = waitForTextSave;'
  vm.runInContext(ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx)
  return { ctx, tab, errors, applied, resolve, reject, snapshot: { content: tab.content, signature: 'new', size: 30, modified: 123 } }
}
test('original frozen candidate reproduces null-state save error after navigation', async () => {
  const old = execFileSync('git', ['show', 'ada0cd607ae64b03c7f8786cef68f7326a5a8663:src/views/TextEditorView.vue'], { encoding: 'utf8' })
  const h = harness(old); const saving = h.ctx.saveAction()
  h.ctx.editor = null; h.resolve(h.snapshot); await saving
  assert.ok(h.errors.some(e => String(e).includes("reading 'state'")))
})
test('save then immediately leave: original tab becomes saved without touching destroyed view', async () => {
  const h = harness(); const saving = h.ctx.saveAction()
  h.ctx.editor = null; h.ctx.loadGeneration++; h.resolve(h.snapshot); await saving
  assert.deepEqual(h.errors, []); assert.equal(h.tab.isDirty, false); assert.equal(h.tab.textSignature, 'new'); assert.equal(h.applied.length, 0)
})
test('immediately reopening waits for native save and reconciled tab', async () => {
  const h = harness(); const saving = h.ctx.saveAction(); h.ctx.editor = null
  let reopened = false
  const reopening = h.ctx.waitAction('meeting.txt').then(() => { reopened = true; assert.equal(h.tab.isDirty, false) })
  await Promise.resolve(); assert.equal(reopened, false)
  h.resolve(h.snapshot); await saving; await reopening; assert.equal(reopened, true)
})
test('switching to a different file cannot apply the old reply there', async () => {
  const h = harness(); const saving = h.ctx.saveAction(); h.ctx.textPath.value = 'budget.txt'; h.ctx.loadGeneration++
  h.resolve(h.snapshot); await saving; assert.equal(h.applied.length, 0); assert.equal(h.tab.isDirty, false)
})
test('new edits after save remain dirty and retain the new disk signature', async () => {
  const h = harness(); const saving = h.ctx.saveAction(); h.tab.content += '，还有一项待确认'; h.ctx.editor = null
  h.resolve(h.snapshot); await saving; assert.equal(h.tab.isDirty, true); assert.ok(h.tab.content.includes('待确认')); assert.equal(h.tab.textSignature, 'new')
})
test('changed save policy must remain dirty even if text is unchanged', async () => {
  const h = harness(); const saving = h.ctx.saveAction(); h.tab.textSaveFinalNewline = true; h.ctx.editor = null
  h.resolve(h.snapshot); await saving; assert.equal(h.tab.isDirty, true)
})
test('real save failure is still reported and dirty draft survives', async () => {
  const h = harness(); const saving = h.ctx.saveAction(); h.ctx.editor = null
  h.reject(new Error('资料库不可访问')); await saving; await h.ctx.waitAction('meeting.txt')
  assert.equal(h.tab.isDirty, true); assert.ok(h.errors[0].includes('资料库不可访问')); assert.equal(h.tab.textSignature, undefined)
})
test('load waits before draft restoration and unmount invalidates pending loads', () => {
  const load = source.slice(source.indexOf('const load = async'), source.indexOf('const loadNextRange'))
  assert.ok(load.indexOf('await waitForTextSave(requestedPath)') < load.indexOf('const draft = currentTab.value'))
  assert.match(source, /onBeforeUnmount\(\(\) => \{\s*\+\+loadGeneration/)
})
