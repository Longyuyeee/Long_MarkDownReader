import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
function harness(viewSource = source) {
  const tab = { id: 'note.md', content: '会议记录', isDirty: false }
  const ticks = [], polls = [], writes = []
  const ctx = vm.createContext({
    tabs: { value: [tab] }, activeTabId: { value: tab.id },
    store: { editorMode: 'wysiwyg', editorModeExplicit: true, updateConfig() {} },
    vditor: { getValue: () => tab.content, destroy() {} }, isVditorReady: true,
    editorLoadGeneration: 0, searchMatchCount: { value: null }, editorLoading: { value: false },
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
  return { ctx, tab, ticks, polls, writes }
}

test('clean mode switch uses initialization without a second unguarded write', () => {
  const h = harness(); h.ctx.switchMode('sv'); h.ticks[0]()
  assert.equal(h.polls.length, 0); assert.deepEqual(h.writes, []); assert.equal(h.tab.isDirty, false)
})
test('latest editor text is cached and genuinely changed text stays dirty', () => {
  const h = harness(); h.ctx.vditor.getValue = () => '刚输入但还未同步的文字'
  h.ctx.switchMode('sv'); assert.equal(h.tab.content, '刚输入但还未同步的文字'); assert.equal(h.tab.isDirty, true)
})
test('an already dirty draft is not marked saved by mode switching', () => {
  const h = harness(); h.tab.isDirty = true; h.ctx.switchMode('sv'); h.ticks[0]()
  assert.equal(h.tab.isDirty, true)
})
test('invalidated mode initialization cannot recreate a disposed editor', () => {
  const h = harness(); h.ctx.switchMode('sv'); h.ctx.editorLoadGeneration++; h.ticks[0]()
  assert.equal(h.ctx.vditor, null)
})
test('old implementation reproduces a stale replay and dirty input after initialization', () => {
  const old = execFileSync('git', ['show', '2f2c80e0:src/views/LibraryMode.vue'], { encoding: 'utf8' })
  const h = harness(old); h.ctx.switchMode('sv'); h.ticks[0](); h.tab.content = '后来输入的新内容'
  h.polls[0](); assert.deepEqual(h.writes, ['会议记录']); assert.equal(h.tab.isDirty, true)
})
