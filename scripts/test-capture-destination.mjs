import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
import { test } from 'node:test'
const source = fs.readFileSync('src/utils/inboxDirectory.ts', 'utf8')
const helper = ts.transpile(fs.readFileSync('src/utils/fileDisplayStyles.ts', 'utf8').replace(/^import .*$/gm, '').replaceAll('export ', ''), { target: ts.ScriptTarget.ES2022 })
const code = ts.transpile(source.replace(/^import .*$/gm, '').replaceAll('export const', 'const'), { target: ts.ScriptTarget.ES2022 })
const ctx = vm.createContext({})
vm.runInContext(helper + '\n' + code + ';globalThis.resolve = rememberedCaptureTarget;globalThis.inbox = inboxDirectory;', ctx)
test('save directly to library by default, preserve chosen destinations and explicit inbox preference', () => {
  assert.equal(ctx.resolve('C:/notes', 'C:/notes/Inbox', null), 'C:/notes')
  assert.equal(ctx.resolve('C:/notes', 'C:/notes/Inbox', 'C:/notes/项目'), 'C:/notes/项目')
  assert.equal(ctx.resolve('C:/notes', 'C:/notes/临时', '__inbox'), 'C:/notes/临时')
  assert.equal(ctx.resolve('C:/notes', 'C:/notes/临时', 'C:/notes/Inbox'), 'C:/notes/临时')
  assert.equal(ctx.resolve('', '', null), '')
})

test('the collection folder uses the same Windows library identity as file styles', () => {
  const libraries = [{ path: 'C:/Notes', inboxDirectory: '项目/待整理' }]
  assert.equal(ctx.inbox('c:/notes', libraries), 'c:/notes/项目/待整理')
  assert.equal(ctx.inbox('C:/other', libraries), 'C:/other/Inbox')
})
