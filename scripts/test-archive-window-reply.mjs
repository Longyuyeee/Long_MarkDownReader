import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const source = fs.readFileSync('src/App.vue', 'utf8')
const start = source.indexOf('const stopArchiveConfirmation =')
const end = source.indexOf('if (isMainWindow)', start)
assert.ok(start >= 0 && end > start)
const code = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 })
test('native request replies use current local session, sequence and dirty state without user actions', async () => {
  for (const mode of ['clean', 'dirty', 'unready', 'disposed', 'no-session', 'rejected']) {
    let handler, stopped = 0
    const calls = [], warnings = [], unlisteners = []
    const ctx = vm.createContext({
      appWindow: { listen: async (name, callback) => { assert.equal(name, 'archive-confirm-window-state'); handler = callback; return () => stopped++ } },
      draftSession: mode === 'no-session' ? null : 'session-2', draftSequence: 7,
      lifecycleDisposed: mode === 'disposed', lifecycleReady: mode !== 'unready', lifecycleUnlisteners: unlisteners,
      hasUnsavedChanges: { value: mode === 'dirty' },
      invoke: async (name, args) => { calls.push({ name, ...args }); if (mode === 'rejected') throw Error('stale') },
      console: { warn: (...args) => warnings.push(args) },
    })
    await vm.runInContext(`(async () => { ${code} })()`, ctx)
    handler({ payload: 'request-3' })
    await new Promise(resolve => setImmediate(resolve))
    if (mode === 'disposed' || mode === 'no-session') assert.equal(calls.length, 0)
    else {
      assert.equal(calls.length, 1); assert.equal(calls[0].name, 'reply_archive_window_confirmation')
      assert.equal(calls[0].sequence, 7); assert.equal(calls[0].session, 'session-2')
      assert.equal(calls[0].dirty, mode === 'dirty'); assert.equal(calls[0].ready, mode !== 'unready')
    }
    assert.equal(stopped, mode === 'disposed' ? 1 : 0)
    assert.equal(unlisteners.length, mode === 'disposed' ? 0 : 1)
    assert.equal(warnings.length, mode === 'rejected' ? 1 : 0)
  }
})
