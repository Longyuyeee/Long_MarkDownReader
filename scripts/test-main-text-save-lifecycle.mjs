import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { test } from 'node:test'

// Execute the production save action, replacing only its environment/IPC.
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const receipt = fs.readFileSync('src/utils/textSaveReceipt.ts', 'utf8').replaceAll('export ', '')
function harness(viewSource = source) {
  const tab = { id: 'note.md', path: 'note.md', title: '会议记录', content: '周五交付', isDirty: true, textSignature: 'old' }
  const requests = [], errors = [], messages = [], writes = []
  let guards = 0
  const editor = { getValue: () => tab.content, setValue: value => writes.push(value) }
  const ctx = vm.createContext({
    vditor: editor, activeTabId: { value: tab.id }, tabs: { value: [tab] },
    store: { libraryPath: 'library-a' }, currentLibGitEnabled: { value: false },
    savingTextTabs: new Set(), suppressEditorInput: false, lastPromptedExternalSignature: '',
    beginWindowSave: () => { guards++; return () => { guards-- } },
    normalizeTextSaveOptions: value => value && typeof value === 'object' ? value : {},
    findFileFormat: () => ({ id: 'markdown', routeName: 'LibraryMode' }), isFormatCapabilitySupported: () => true,
    invoke: (command, args) => new Promise((resolve, reject) => requests.push({ command, args, resolve, reject })),
    updateTabFromTextSnapshot: (t, snapshot) => { t.content = snapshot.content; t.isDirty = false; t.textSignature = snapshot.signature },
    message: { success: value => messages.push(value), warning: value => messages.push(value) },
    handleError: error => errors.push(error), setTimeout: callback => callback(),
  })
  const start = viewSource.indexOf('const saveCurrentFile = async')
  const end = viewSource.indexOf('const syncUserSelectedVditorMode', start)
  assert.ok(start > 0 && end > start)
  vm.runInContext(ts.transpileModule(receipt + '\n' + viewSource.slice(start, end) + '\nglobalThis.save = saveCurrentFile', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, ctx)
  const resolve = (index = 0) => requests[index].resolve({ content: requests[index].args.content, signature: `disk-${index}` })
  return { tab, ctx, requests, errors, messages, writes, resolve, guards: () => guards }
}

test('pre-fix code reproduces lost subsequent typing and cross-tab overwrite', async () => {
  const old = execFileSync('git', ['show', '5251c5d7:src/views/LibraryMode.vue'], { encoding: 'utf8' })
  const typing = harness(old); const first = typing.ctx.save(); typing.tab.content += '，价格还要确认'
  typing.resolve(); await first
  assert.equal(typing.tab.content, '周五交付'); assert.equal(typing.tab.isDirty, false)
  const switching = harness(old); const second = switching.ctx.save()
  switching.ctx.activeTabId.value = 'budget.md'
  switching.ctx.vditor = { getValue: () => '预算 3000', setValue: value => switching.writes.push(value) }
  switching.resolve(); await second; assert.deepEqual(switching.writes, ['周五交付'])
})

test('slow save retains subsequent typing and advances signature for the next save', async () => {
  const h = harness(); const first = h.ctx.save()
  assert.equal(h.guards(), 1)
  h.tab.content += '，价格还要确认'
  h.resolve(); await first
  assert.equal(h.tab.content, '周五交付，价格还要确认'); assert.equal(h.tab.isDirty, true)
  assert.equal(h.tab.textSignature, 'disk-0'); assert.deepEqual(h.writes, []); assert.equal(h.guards(), 0)
  const second = h.ctx.save(); assert.equal(h.requests[1].args.expectedSignature, 'disk-0')
  assert.equal(h.requests[1].args.content, h.tab.content)
  h.resolve(1); await second; assert.equal(h.tab.isDirty, false)
})

test('deleting all text during a pending save retains the empty dirty draft', async () => {
  const h = harness(); const saving = h.ctx.save(); h.tab.content = ''
  h.resolve(); await saving; assert.equal(h.tab.content, ''); assert.equal(h.tab.isDirty, true)
})

test('switching tabs never writes an old receipt into the newly active editor', async () => {
  const h = harness(); const saving = h.ctx.save()
  h.ctx.activeTabId.value = 'budget.md'; h.ctx.vditor = { getValue: () => '预算 3000', setValue: v => h.writes.push(v) }
  h.resolve(); await saving; assert.deepEqual(h.writes, []); assert.equal(h.tab.isDirty, false)
})

test('destroying or replacing the editor while saving does not access the old view', async () => {
  for (const replacement of [null, { getValue: () => '新工作面', setValue: () => assert.fail('old receipt touched replacement') }]) {
    const h = harness(); const saving = h.ctx.save(); h.ctx.vditor = replacement
    h.resolve(); await saving; assert.deepEqual(h.errors, []); assert.equal(h.guards(), 0)
  }
})

test('failed native save preserves draft and signature and permits an explicit retry', async () => {
  const h = harness(); const first = h.ctx.save(); h.requests[0].reject(new Error('磁盘写入失败')); await first
  assert.equal(h.tab.isDirty, true); assert.equal(h.tab.textSignature, 'old'); assert.equal(h.guards(), 0)
  assert.equal(h.errors[0].message, '磁盘写入失败')
  const retry = h.ctx.save(); h.resolve(1); await retry; assert.equal(h.tab.isDirty, false)
})

test('repeated save while pending does not submit a second stale request', async () => {
  const h = harness(); const first = h.ctx.save(); h.tab.content += '，补充'
  await h.ctx.save(); assert.equal(h.requests.length, 1); assert.equal(h.guards(), 1)
  assert.ok(h.messages.some(value => value.includes('正在保存')))
  h.resolve(); await first; assert.equal(h.tab.isDirty, true)
})

test('switching libraries does not retarget the follow-up Git commit', async () => {
  const h = harness(); h.ctx.currentLibGitEnabled.value = true
  const first = h.ctx.save(); h.ctx.store.libraryPath = 'library-b'; h.resolve(); await first
  assert.equal(h.requests[1].command, 'git_commit'); assert.equal(h.requests[1].args.libraryPath, 'library-a')
  h.requests[1].resolve()
})
