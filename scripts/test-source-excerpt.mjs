import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const box = { exports: {}, URL, URLSearchParams }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/sourceExcerpt.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, box)
const { sourceExcerpt, parseSourceReference } = box.exports

test('excerpt quotes every line and source round-trips special paths and PDF position', () => {
  const text = sourceExcerpt('第一行\n\n第二行', { path: '/库/资料/a #&[1].pdf', title: '资料[1]', page: 4, annotationId: 'note&2' }, '/库')
  assert.ok(text.startsWith('> 第一行\n> \n> 第二行'))
  const href = text.match(/\]\((longedit:.*)\)/)[1]
  assert.deepEqual(JSON.parse(JSON.stringify(parseSourceReference(href, '/新库'))), { path: '/新库/资料/a #&[1].pdf', page: '4', annotation: 'note&2' })
})
test('Windows reference keeps native path identity and library-bound source', () => {
  const root = 'E:\\笔记'
  const text = sourceExcerpt('摘录', { path: root + '\\a.md', title: 'a' }, root)
  const href = text.match(/\]\((longedit:.*)\)/)[1]
  assert.equal(parseSourceReference(href, root).path, root + '\\a.md')
  assert.throws(() => sourceExcerpt('摘录', { path: '/other/a.md', title: 'a' }, '/库'))
  assert.equal(parseSourceReference('longedit://source?path=../outside.md', '/库'), null)
})


test('actual Markdown source click opens the library file with PDF position', () => {
  const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const handler = source.slice(source.indexOf('const openSourceReference ='), source.indexOf('const openPdfReference ='))
  const opened = []
  const context = { parseSourceReference, store: { libraryPath: '/库' }, router: {},
    findFileFormat: () => ({ id: 'pdf' }), message: { warning() {} },
    openManagedFile: (_router, path, query) => opened.push({ path, query }) }
  vm.runInNewContext(ts.transpileModule(handler + '\nglobalThis.open = openSourceReference', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  context.open({ target: { closest: () => ({ getAttribute: () => 'longedit://source?path=a.pdf&page=7&annotation=note' }) }, preventDefault() {}, stopPropagation() {} })
  assert.equal(opened[0].path, '/库/a.pdf')
  assert.equal(opened[0].query.page, '7')
  assert.equal(opened[0].query.annotation, 'note')
  assert.ok(source.includes('@click.capture="openSourceReference"'))
})


test('native canonical Windows and UNC source paths resolve within the library', () => {
  const windows = sourceExcerpt('摘录', { path: String.raw`\\?\E:\笔记\a.md`, title: 'a' }, String.raw`E:\笔记`)
  assert.ok(windows.includes('path=a.md'))
  const unc = sourceExcerpt('摘录', { path: String.raw`\\?\UNC\SERVER\Share\a.md`, title: 'a' }, String.raw`\\server\share`)
  assert.ok(unc.includes('path=a.md'))
})
