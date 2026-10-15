import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'

// Run the actual production notification callback, not a reimplemented model.
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const start = source.indexOf('      input: (val) => {')
const end = source.indexOf('\n      after:', start)
assert.ok(start >= 0 && end > start)
const callback = source.slice(start, end).trim().replace(/^input:\s*/, '').replace(/,\s*$/, '')
function harness(content, dirty = false) {
  const tab = { id: 'C:/notes/draft.md', path: 'C:/notes/draft.md', content, isDirty: dirty }
  const context = vm.createContext({
    tabs: { value: [tab] }, activeTabId: { value: tab.id },
    searchMatchCount: { value: 1 }, suppressEditorInput: false, wordCount: { value: 0 },
    store: { updateTabContent(path, value) { assert.equal(path, tab.path); tab.content = value } },
  })
  vm.runInContext('globalThis.notify = ' + callback, context)
  return { tab, notify: context.notify }
}

test('an identical delayed Markdown notification cannot dirty a completed save', () => {
  const content = '# 用户刚输入的未保存预算草稿\n', h = harness(content)
  h.notify(content)
  assert.equal(h.tab.isDirty, false, 'a repeated editor notification is not new user input')
  assert.equal(h.tab.content, content)
})

test('real subsequent edits stay dirty and duplicate notifications never clear drafts', () => {
  const h = harness('# 已保存\n')
  h.notify('# 保存期间新增输入\n')
  assert.equal(h.tab.isDirty, true); assert.equal(h.tab.content, '# 保存期间新增输入\n')
  h.notify('# 保存期间新增输入\n')
  assert.equal(h.tab.isDirty, true)
})

function externalHarness() {
  const source = fs.readFileSync('src/views/TempMode.vue', 'utf8')
  const start = source.indexOf('    input:')
  const end = source.indexOf('\n    after:', start)
  assert.ok(start >= 0 && end > start)
  const context = vm.createContext({ isDirty: { value: false }, originalExternalContent: '# 已保存\n' })
  vm.runInContext('globalThis.notify = ' + source.slice(start, end).trim().replace(/^input:\s*/, '').replace(/,\s*$/, ''), context)
  return context
}
test('external Markdown repeated saved-content notifications do not block storing the saved file', () => {
  const h = externalHarness(); h.notify('# 已保存\n')
  assert.equal(h.isDirty.value, false)
})
test('external Markdown genuine edits during a save remain dirty against its acknowledged baseline', () => {
  const h = externalHarness(); h.notify('# 新编辑\n'); assert.equal(h.isDirty.value, true)
  h.originalExternalContent = '# 已提交\n'
  h.notify('# 新编辑\n'); assert.equal(h.isDirty.value, true)
  h.notify('# 已提交\n'); assert.equal(h.isDirty.value, false)
})
