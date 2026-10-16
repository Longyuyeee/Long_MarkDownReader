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
    suppressEditorInput: false, editorDisplayBaseline: null, referenceBookmark: null,
    pendingEditorSaveLoad: { value: false },
    document: { querySelectorAll: () => [] }, onBeforeUnmount() {}, clearTimeout() {}, route: { query: {} }, recallWorkspaceViewState() {},
    vditor: { vditor: {}, setValue: value => writes.push(value), getValue: () => writes.at(-1), disabled: () => { enabled = false }, enable: () => { enabled = true } },
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

test('failed explicit reload retains dirty content and disk identity, including an empty draft', async () => {
  for (const draft of ['用户刚写的正文', '']) {
    const h = harness(), failures = []
    h.tab.content = draft; h.tab.isDirty = true; h.tab.textSignature = 'previous-disk'
    h.ctx.store = { libraryPath: 'library' }
    h.ctx.findFileFormat = () => ({ id: 'markdown', routeName: 'LibraryMode' })
    h.ctx.invoke = async () => { throw { code: 'path-outside-workspace', message: 'path not found' } }
    h.ctx.handleError = (...args) => failures.push(args)
    assert.equal(await h.ctx.load('note.md', true), false)
    assert.equal(h.tab.content, draft)
    assert.equal(h.tab.isDirty, true)
    assert.equal(h.tab.textSignature, 'previous-disk')
    assert.equal(h.tab.textLoadError, undefined)
    assert.deepEqual(h.writes, [draft])
    assert.equal(failures.length, 1)
    h.timers.find(t => t.delay === 0).callback()
    assert.equal(h.enabled(), true)
  }
})

test('explicit reload applies only successful disk content; late results cannot overwrite another editor', async () => {
  for (const navigates of [false, true]) {
    const h = harness()
    h.tab.isDirty = true
    h.ctx.store = { libraryPath: 'library' }
    h.ctx.findFileFormat = () => ({ id: 'markdown', routeName: 'LibraryMode' })
    let resolve
    h.ctx.invoke = () => new Promise(done => { resolve = done })
    const work = h.ctx.load('note.md', true)
    assert.equal(h.tab.content, '保存前缓存')
    if (navigates) h.ctx.activeTabId.value = 'other.md'
    resolve({ content: '磁盘新正文', signature: 'new-disk', contentDigest: 'digest' })
    const success = await work
    if (navigates) {
      assert.equal(success, undefined)
      assert.equal(h.tab.content, '保存前缓存')
      assert.equal(h.tab.isDirty, true)
      assert.deepEqual(h.writes, [])
    } else {
      assert.equal(success, true)
      assert.equal(h.tab.content, '磁盘新正文')
      assert.equal(h.tab.isDirty, false)
      assert.equal(h.tab.textSignature, 'new-disk')
      assert.deepEqual(h.writes, ['磁盘新正文'])
    }
  }
})
