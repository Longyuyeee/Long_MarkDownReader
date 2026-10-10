import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const box = { exports: {} }
vm.runInNewContext(compile(fs.readFileSync('src/utils/searchLocation.ts', 'utf8')), box)
const firstSearchRange = box.exports.firstSearchRange
for (const [text, query, expected] of [
  ['🙂İ预算预算', '预算', { from: 3, to: 5 }],
  ['İstanbul', 'i', { from: 0, to: 1 }],
  ['a.b axb', 'a.b', { from: 0, to: 3 }],
  ['A needle', ' NEEDLE ', { from: 2, to: 8 }],
  ['预算', '', null], ['已修改', '预算', null],
]) test(`editor offsets: ${text}/${query}`, () => assert.deepEqual(JSON.parse(JSON.stringify(firstSearchRange(text, query))), expected))

test('text editor locates in current draft without replacing it; repeated intent only runs once', () => {
  const source = fs.readFileSync('src/views/TextEditorView.vue', 'utf8')
  const handler = source.slice(source.indexOf("let locatedSearchToken = ''"), source.indexOf('watch([() => route.query.searchLocator'))
  const transactions = [], notices = []
  const context = {
    firstSearchRange, route: { query: { searchLocator: '1', searchNeedle: '预算' } },
    loading: { value: false }, loadError: { value: '' }, rangeMode: { value: false }, viewMode: { value: 'source' },
    message: { info: text => notices.push(text) },
    EditorView: { scrollIntoView: position => position },
    editor: { state: { doc: { toString: () => '草稿预算' } }, dispatch: value => transactions.push(value), focus: () => {} },
  }
  vm.runInNewContext(compile(handler + '\nglobalThis.reveal = revealSearchMatch'), context)
  context.reveal(); context.reveal()
  assert.equal(transactions.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(transactions[0].selection)), { anchor: 2, head: 4 })
  assert.equal('changes' in transactions[0], false)
  context.route.query = { searchLocator: '2', searchNeedle: '不在草稿中' }
  context.reveal()
  assert.equal(transactions.length, 1)
  assert.equal(notices.length, 1)
})


test('Markdown waits for the requested document and selects without changing editor mode or content', () => {
  const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const handler = source.slice(source.indexOf("let locatedSearchToken = ''"), source.indexOf('let taskLocatorTarget:'))
  const selected = [], notices = []
  const parent = { classList: { add() {}, remove() {} }, scrollIntoView() {} }
  const range = { startContainer: { parentElement: parent } }
  const root = { focus() {} }
  const context = {
    route: { query: { searchLocator: '1', searchNeedle: '预算', path: '/draft.md' } },
    activeTabId: { value: '/draft.md' }, lastLoadedPath: '/old.md', isVditorReady: true,
    vditor: { getCurrentMode: () => 'ir', vditor: { ir: { element: root } } },
    findEditorSearchRange: actualRoot => { assert.equal(actualRoot, root); return range },
    message: { info: text => notices.push(text) },
    window: { getSelection: () => ({ removeAllRanges() {}, addRange: value => selected.push(value) }) },
  }
  vm.runInNewContext(compile(handler + '\nglobalThis.reveal = revealSearchMatch'), context)
  context.reveal()
  assert.equal(selected.length, 0)
  context.lastLoadedPath = '/draft.md'
  context.reveal(); context.reveal()
  assert.equal(selected.length, 1)
  context.route.query.searchLocator = '2'
  context.findEditorSearchRange = () => null
  context.reveal()
  assert.equal(notices.length, 1)
})
