import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const ownership = fs.readFileSync('src/utils/mainTextSaveOwnership.ts', 'utf8').replaceAll('export ', '')
function harness(viewSource = source) {
  const tab = { path: 'note.md', content: '保存前缓存', isDirty: false }
  const timers = [], writes = []
  let enabled = true
  const ctx = vm.createContext({
    tabs: { value: [tab] }, activeTabId: { value: tab.path }, lastLoadedPath: '',
    suppressEditorInput: false, referenceBookmark: null,
    pendingEditorSaveLoad: { value: false },
    vditor: { vditor: {}, setValue: value => writes.push(value), disabled: () => { enabled = false }, enable: () => { enabled = true } },
    setTimeout: (callback, delay) => timers.push({ callback, delay }), nextTick: callback => callback(),
    startAdaptiveMotion() {}, fetchHistory() {}, refreshVisibleOutline() {}, updateWordCount() {}, fixEditorImages() {},
    revealSearchMatch() {}, scheduleWorkspaceTaskReveal() {}, scheduleRelationEvidenceReveal() {},
  })
  const start = viewSource.indexOf('let editorLoadGeneration = 0')
  const end = viewSource.indexOf('const updateTabFromTextSnapshot', start)
  assert.ok(start > 0 && end > start)
  vm.runInContext(ts.transpileModule(ownership + '\n' + viewSource.slice(start, end) + `
    globalThis.load = loadFileToEditor;
    globalThis.acquire = tryAcquireMainTextSave;
    globalThis.invalidate = () => { editorLoadGeneration++; vditor = null };
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx)
  return { ctx, tab, writes, timers, enabled: () => enabled }
}

test('reopening waits for receipt reconciliation before reading cached content', async () => {
  const h = harness(); const release = h.ctx.acquire('note.md')
  const loading = h.ctx.load('note.md')
  assert.equal(h.enabled(), false); assert.deepEqual(h.writes, [])
  assert.equal(h.ctx.pendingEditorSaveLoad.value, true)
  h.tab.content = '回执归一化后的正文'; release(); await loading
  assert.deepEqual(h.writes, ['回执归一化后的正文'])
  assert.equal(h.ctx.pendingEditorSaveLoad.value, false)
  h.timers.find(t => t.delay === 0).callback(); assert.equal(h.enabled(), true)
})

test('failed save release restores retained dirty draft, including empty text', async () => {
  const h = harness(); const release = h.ctx.acquire('note.md')
  h.tab.content = ''; h.tab.isDirty = true
  const loading = h.ctx.load('note.md'); release(); await loading
  assert.deepEqual(h.writes, ['']); assert.equal(h.tab.isDirty, true)
})

test('navigation or destruction invalidates a waiting load', async () => {
  for (const invalidate of [h => { h.ctx.activeTabId.value = 'other.md' }, h => h.ctx.invalidate()]) {
    const h = harness(); const release = h.ctx.acquire('note.md'); const loading = h.ctx.load('note.md')
    invalidate(h); release(); await loading; assert.deepEqual(h.writes, [])
  }
})

test('post-load callbacks cannot clear newer dirty state or enable a destroyed editor', async () => {
  const h = harness(); await h.ctx.load('note.md')
  h.timers.find(t => t.delay === 0).callback()
  h.tab.content = '用户刚写的新内容'; h.tab.isDirty = true
  h.timers.find(t => t.delay === 50).callback(); assert.equal(h.tab.isDirty, true)
  const disposed = harness(); await disposed.ctx.load('note.md'); disposed.ctx.invalidate()
  for (const timer of disposed.timers) assert.doesNotThrow(timer.callback)
})

test('previous code demonstrates early stale restoration and delayed dirty reset', async () => {
  const old = execFileSync('git', ['show', '68e1c18f:src/views/LibraryMode.vue'], { encoding: 'utf8' })
  const h = harness(old); const release = h.ctx.acquire('note.md')
  await h.ctx.load('note.md'); assert.deepEqual(h.writes, ['保存前缓存']); release()
  h.timers.find(t => t.delay === 0).callback()
  h.tab.isDirty = true; h.timers.find(t => t.delay === 50).callback()
  assert.equal(h.tab.isDirty, false)
})
