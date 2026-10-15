import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const compile = file => ts.transpile(fs.readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const membership = { exports: {} }; vm.runInNewContext(compile('src/utils/workSessions.ts'), membership)
const context = { exports: {}, require: name => { assert.equal(name, './workSessions'); return membership.exports } }
vm.runInNewContext(compile('src/utils/libraryTreeAncestors.ts'), context)
const ancestors = (root, file) => Array.from(context.exports.libraryTreeAncestors(root, file))

test('library roots and drive prefixes are never expanded as if they were folders', () => {
  assert.deepEqual(ancestors('C:/notes', 'C:/notes/a.txt'), [])
  assert.deepEqual(ancestors('C:\\notes', '\\\\?\\C:\\notes\\a.txt'), [])
  assert.deepEqual(ancestors('C:/notes', 'c:\\NOTES\\a.txt'), [])
})
test('only real in-library parent paths are retained, outermost first', () => {
  assert.deepEqual(ancestors('C:/notes', 'C:/notes/one/two/a.txt'), ['C:/notes/one', 'C:/notes/one/two'])
  assert.deepEqual(ancestors('C:\\notes', '\\\\?\\C:\\notes\\one\\two\\a.md'), ['\\\\?\\C:\\notes\\one', '\\\\?\\C:\\notes\\one\\two'])
})
test('UNC native spellings stop at the same configured root', () => {
  assert.deepEqual(ancestors('\\\\server\\share\\notes', '\\\\?\\UNC\\server\\share\\notes\\one\\a.md'), ['\\\\?\\UNC\\server\\share\\notes\\one'])
  assert.deepEqual(ancestors('\\\\server\\share\\notes', '\\\\?\\UNC\\server\\share\\notes\\a.md'), [])
})
test('outside, adjacent, traversal and unset-library paths add no expansion state', () => {
  for (const file of ['C:/notes2/a.md', 'C:/notes/../private/a.md', 'C:/other/a.md']) assert.deepEqual(ancestors('C:/notes', file), [])
  assert.deepEqual(ancestors('', 'C:/notes/a.md'), [])
})
test('shared root comparison treats extended UNC paths as equivalent, not another library', () => {
  const context = { exports: {} }; vm.runInNewContext(compile('src/utils/savedCollections.ts'), context)
  assert.equal(context.exports.sameWorkspacePath('\\\\server\\share\\notes', '\\\\?\\UNC\\server\\share\\notes'), true)
  assert.equal(context.exports.sameWorkspacePath('\\\\server\\share\\notes', '\\\\?\\UNC\\other\\share\\notes'), false)
})
