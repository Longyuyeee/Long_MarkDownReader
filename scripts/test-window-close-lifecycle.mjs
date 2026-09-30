import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { effectScope, ref } from 'vue'

const source = fs.readFileSync('src/App.vue', 'utf8')
function harness(main = true) {
  const calls = []
  const store = { tabs: [], isTempDirty: true, exitStrategy: 'ask', updateConfig: async value => calls.push(value) }
  const box = value => ({ value })
  const context = vm.createContext({
    windowDraftCount: box(0), store, isMainWindow: main, showExitModal: box(false), showDiscardConfirm: box(false),
    discardConfirmTitle: box(''), discardConfirmContent: box(''), discardConfirmResolver: null,
    dontAskAgain: box(false), routeErrorMessage: box(''),
    appWindow: { hide: async () => calls.push('hide'), destroy: async () => calls.push('destroy') },
    invoke: async name => calls.push(name),
  })
  const code = source.slice(source.indexOf('let closeBusy ='), source.indexOf('const hasUnsavedChanges ='))
  vm.runInContext(ts.transpileModule(code + '\nlifecycleReady = true; globalThis.actions = { closeWindow, handleExit, resolveDiscardConfirm };', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { context, calls, store, ...context.actions }
}

test('minimize preserves temporary draft and never asks to discard', async () => {
  const h = harness(); h.store.exitStrategy = 'minimize'
  await h.closeWindow()
  assert.deepEqual(h.calls, ['hide'])
  assert.equal(h.store.isTempDirty, true)
  assert.equal(h.context.showDiscardConfirm.value, false)
})
test('ask choice precedes discard; cancellation preserves the editor', async () => {
  const h = harness(); await h.closeWindow()
  assert.equal(h.context.showExitModal.value, true)
  assert.equal(h.context.showDiscardConfirm.value, false)
  const pending = h.handleExit()
  assert.equal(h.context.showExitModal.value, false)
  h.resolveDiscardConfirm(false); await pending
  assert.deepEqual(h.calls, [])
  assert.equal(h.store.isTempDirty, true)
})
test('repeated system close requests yield one confirmation and one exit', async () => {
  const h = harness(); h.store.exitStrategy = 'quit'
  const first = h.closeWindow(); await h.closeWindow(); await h.handleExit()
  h.resolveDiscardConfirm(true); await first
  assert.deepEqual(h.calls, ['exit_app'])
})
test('secondary windows close after confirmation without re-entering native CloseRequested', async () => {
  const h = harness(false); const pending = h.closeWindow()
  h.resolveDiscardConfirm(false); await pending
  assert.deepEqual(h.calls, [])
  const retry = h.closeWindow(); h.resolveDiscardConfirm(true); await retry
  assert.deepEqual(h.calls, ['destroy'])
})
test('failure to exit remains recoverable and permits retry', async () => {
  const h = harness(); h.store.isTempDirty = false
  h.context.invoke = async () => { throw Error('另一窗口尚未保存') }
  await h.handleExit()
  assert.match(h.context.routeErrorMessage.value, /另一窗口尚未保存/)
  h.context.invoke = async () => h.calls.push('exit_app')
  await h.handleExit(); assert.deepEqual(h.calls, ['exit_app'])
})

test('local editor drafts join the close guard and disappear on unmount', () => {
  const context = vm.createContext({ exports: {}, require: createRequire(import.meta.url) })
  vm.runInContext(ts.transpileModule(fs.readFileSync('src/services/windowDrafts.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const { useWindowDraft, windowDraftCount } = context.exports
  const dirty = ref(false); const scope = effectScope()
  scope.run(() => useWindowDraft(() => dirty.value))
  assert.equal(windowDraftCount.value, 0)
  dirty.value = true; assert.equal(windowDraftCount.value, 1)
  dirty.value = false; assert.equal(windowDraftCount.value, 0)
  dirty.value = true; scope.stop(); assert.equal(windowDraftCount.value, 0)
})

test('an Office or canvas draft prevents exit even when text tabs are clean', async () => {
  const h = harness(); h.store.isTempDirty = false; h.context.windowDraftCount.value = 1
  const pending = h.handleExit()
  assert.equal(h.context.showDiscardConfirm.value, true)
  h.resolveDiscardConfirm(false); await pending
  assert.deepEqual(h.calls, [])
})
