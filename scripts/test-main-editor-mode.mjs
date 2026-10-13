import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
function harness(viewSource = source) {
  const tab = { id: 'note.md', content: '会议记录', isDirty: false }
  const shortcutHost = {}
  const ticks = [], polls = [], writes = []
  const ctx = vm.createContext({
    tabs: { value: [tab] }, activeTabId: { value: tab.id },
    store: { editorMode: 'wysiwyg', editorModeExplicit: true, async updateConfig(patch) { Object.assign(this, patch) } },
    vditor: { getValue: () => tab.content, destroy() {} }, isVditorReady: true,
    editorLoadGeneration: 0, searchMatchCount: { value: null }, editorLoading: { value: false },
    editorModeChangeBusy: { value: false }, message: { error() {} },
    documentShortcutHost: { value: shortcutHost },
    cleanupEditorListeners() {}, nextTick: callback => ticks.push(callback),
    setInterval: callback => polls.push(callback), clearInterval() {},
    initVditor: () => {
      ctx.vditor = { setValue: value => { writes.push(value); tab.isDirty = true } }
      ctx.isVditorReady = true
    },
  })
  const start = viewSource.indexOf('const switchEditorMode =')
  const end = viewSource.indexOf('const ensureVditorModeForFile', start)
  assert.ok(start > 0 && end > start)
  vm.runInContext(ts.transpileModule(viewSource.slice(start, end) + '\nglobalThis.switchMode = switchEditorMode', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, ctx)
  return { ctx, tab, ticks, polls, writes, shortcutHost }
}

test('clean mode switch uses initialization without a second unguarded write', async () => {
  const h = harness(); await h.ctx.switchMode('sv'); h.ticks[0]()
  assert.equal(h.polls.length, 0); assert.deepEqual(h.writes, []); assert.equal(h.tab.isDirty, false)
  assert.equal(h.ctx.documentShortcutHost.value, null)
})
test('latest editor text is cached and genuinely changed text stays dirty', async () => {
  const h = harness(); h.ctx.vditor.getValue = () => '刚输入但还未同步的文字'
  await h.ctx.switchMode('sv'); assert.equal(h.tab.content, '刚输入但还未同步的文字'); assert.equal(h.tab.isDirty, true)
})
test('an already dirty draft is not marked saved by mode switching', async () => {
  const h = harness(); h.tab.isDirty = true; await h.ctx.switchMode('sv'); h.ticks[0]()
  assert.equal(h.tab.isDirty, true)
})
test('invalidated mode initialization cannot recreate a disposed editor', async () => {
  const h = harness(); await h.ctx.switchMode('sv'); h.ctx.editorLoadGeneration++; h.ticks[0]()
  assert.equal(h.ctx.vditor, null)
})

test('delayed preference commit keeps the editor live and caches subsequent typing', async () => {
  const h = harness(), editor = h.ctx.vditor
  let resolve, latest = '会议记录'
  h.ctx.store.updateConfig = patch => new Promise(done => { resolve = () => { Object.assign(h.ctx.store, patch); done() } })
  editor.getValue = () => latest
  const change = h.ctx.switchMode('sv')
  assert.equal(h.ctx.vditor, editor); assert.equal(h.ticks.length, 0)
  latest = '保存设置时继续输入的新草稿'
  resolve(); await change
  assert.equal(h.ctx.store.editorMode, 'sv'); assert.equal(h.tab.content, latest); assert.equal(h.tab.isDirty, true)
  h.ticks[0](); assert.deepEqual(h.writes, [])
})

test('failed preference save leaves the existing editor and draft intact', async () => {
  const h = harness(), editor = h.ctx.vditor, messages = []
  h.ctx.message.error = text => messages.push(text)
  h.ctx.store.updateConfig = async () => { throw Error('disk unavailable') }
  await h.ctx.switchMode('sv')
  assert.equal(h.ctx.vditor, editor); assert.equal(h.tab.content, '会议记录'); assert.equal(h.tab.isDirty, false)
  assert.equal(h.ticks.length, 0); assert.equal(h.ctx.editorModeChangeBusy.value, false)
  assert.equal(h.ctx.documentShortcutHost.value, h.shortcutHost)
  assert.match(messages[0], /无法切换编辑模式/)
})

test('leaving the requested document during preference save does not destroy the next editor', async () => {
  const h = harness()
  let resolve
  h.ctx.store.updateConfig = () => new Promise(done => { resolve = done })
  const change = h.ctx.switchMode('sv')
  const nextEditor = { getValue: () => '新文档' }
  h.ctx.vditor = nextEditor; h.ctx.activeTabId.value = 'next.md'
  resolve(); await change
  assert.equal(h.ctx.vditor, nextEditor); assert.equal(h.ticks.length, 0)
  assert.equal(h.ctx.documentShortcutHost.value, h.shortcutHost)
})
test('old implementation reproduces a stale replay and dirty input after initialization', () => {
  const old = execFileSync('git', ['show', '2f2c80e0:src/views/LibraryMode.vue'], { encoding: 'utf8' })
  const h = harness(old); h.ctx.switchMode('sv'); h.ticks[0](); h.tab.content = '后来输入的新内容'
  h.polls[0](); assert.deepEqual(h.writes, ['会议记录']); assert.equal(h.tab.isDirty, true)
})
