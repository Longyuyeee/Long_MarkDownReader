import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const compile = file => ts.transpile(fs.readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const membership = { exports: {} }; vm.runInNewContext(compile('src/utils/workSessions.ts'), membership)
const saved = { exports: {} }; vm.runInNewContext(compile('src/utils/savedCollections.ts'), saved)
const context = { exports: {}, require: name => { if (name === './workSessions') return membership.exports; assert.equal(name, './savedCollections'); return saved.exports } }
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

test('ordinary nested routes expand real canonical keys and load each actual ancestor', async () => {
  const root = 'C:/notes', one = { key: '\\\\?\\C:\\notes\\One', isLeaf: false }, calls = []
  const two = { key: '\\\\?\\C:\\notes\\One\\Two', isLeaf: false }
  const keys = await context.exports.resolveLibraryTreeAncestors(root, 'c:/NOTES/one/two/a.md', [one], async node => {
    calls.push(node.key); node.children = node === one ? [two] : [{ key: '\\\\?\\C:\\notes\\One\\Two\\a.md', isLeaf: true }]
  })
  assert.deepEqual(Array.from(keys), [one.key, two.key]); assert.deepEqual(calls, [one.key, two.key])
})
test('missing directories and leaf rows never create synthetic expansion keys', async () => {
  let calls = 0
  for (const nodes of [[], [{ key: 'C:/notes/one', isLeaf: true }]]) {
    assert.deepEqual(Array.from(await context.exports.resolveLibraryTreeAncestors('C:/notes', 'C:/notes/one/a.md', nodes, async () => { calls++ })), [])
  }
  assert.equal(calls, 0)
})
test('stale or failed ancestor reads cannot publish expansion state', async () => {
  const node = { key: 'C:/notes/one', isLeaf: false }; let current = true
  assert.deepEqual(Array.from(await context.exports.resolveLibraryTreeAncestors('C:/notes', 'C:/notes/one/a.md', [node], async () => { node.children = []; current = false }, { isCurrent: () => current })), [])
  assert.deepEqual(Array.from(await context.exports.resolveLibraryTreeAncestors('C:/notes', 'C:/notes/one/a.md', [{ key: node.key, isLeaf: false }], async () => false)), [])
})
test('explicit directory reveal includes only real descendants, never the root', async () => {
  const node = { key: '\\\\?\\C:\\notes\\one', isLeaf: false, children: [] }
  const resolve = target => context.exports.resolveLibraryTreeAncestors('C:/notes', target, [node], async () => { throw Error('already loaded') }, { directory: true })
  assert.deepEqual(Array.from(await resolve('C:/notes/one')), [node.key])
  assert.deepEqual(Array.from(await resolve('C:/notes')), [])
})
