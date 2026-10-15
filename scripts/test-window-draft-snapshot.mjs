import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { test } from 'node:test'
test('cross-library preflight captures pending input without writing and disposes snapshot hooks', () => {
  const sandbox = { exports: {}, require: name => { assert.equal(name, 'vue'); return Vue } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/windowDrafts.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox)
  const api = sandbox.exports, first = Vue.effectScope(), second = Vue.effectScope(), captured = []
  first.run(() => api.useWindowDraftSnapshot(() => captured.push('markdown draft')))
  second.run(() => api.useWindowDraftSnapshot(() => captured.push('external draft')))
  api.snapshotWindowDrafts(); assert.deepEqual(captured, ['markdown draft', 'external draft'])
  first.stop(); api.snapshotWindowDrafts(); assert.deepEqual(captured, ['markdown draft', 'external draft', 'external draft'])
  second.stop(); api.snapshotWindowDrafts(); assert.equal(captured.length, 3)
  const finish = api.beginWindowSave(); assert.ok(api.windowDraftCount.value > 0); finish(); assert.equal(api.windowDraftCount.value, 0)
})
