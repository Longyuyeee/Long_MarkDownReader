import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
import { test } from 'node:test'
const source = fs.readFileSync('src/utils/inboxDirectory.ts', 'utf8')
const code = ts.transpile(source.replace(/^import .*$/m, '').replaceAll('export const', 'const'), { target: ts.ScriptTarget.ES2022 })
const ctx = vm.createContext({})
vm.runInContext(code + ';globalThis.resolve = rememberedCaptureTarget;', ctx)
test('save directly to library by default, preserve chosen destinations and explicit inbox preference', () => {
  assert.equal(ctx.resolve('C:/notes', 'C:/notes/Inbox', null), 'C:/notes')
  assert.equal(ctx.resolve('C:/notes', 'C:/notes/Inbox', 'C:/notes/项目'), 'C:/notes/项目')
  assert.equal(ctx.resolve('C:/notes', 'C:/notes/临时', '__inbox'), 'C:/notes/临时')
  assert.equal(ctx.resolve('C:/notes', 'C:/notes/临时', 'C:/notes/Inbox'), 'C:/notes/临时')
  assert.equal(ctx.resolve('', '', null), '')
})
