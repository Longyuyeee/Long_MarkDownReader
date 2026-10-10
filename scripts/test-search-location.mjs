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
    searchRanges: box.exports.searchRanges, wrapSearchIndex: box.exports.wrapSearchIndex,
    searchMatchIndex: { value: 0 }, searchMatchCount: { value: null }, searchNavigationClosed: { value: false }, route: { query: { searchLocator: '1', searchNeedle: '预算' } },
    loading: { value: false }, loadError: { value: '' }, rangeMode: { value: false }, viewMode: { value: 'source' },
    message: { info: text => notices.push(text) },
    EditorView: { scrollIntoView: position => position },
    editor: { state: { doc: { toString: () => '草稿预算再预算' } }, dispatch: value => transactions.push(value), focus: () => {} },
  }
  vm.runInNewContext(compile(handler + '\nglobalThis.reveal = revealSearchMatch'), context)
  context.reveal(); context.reveal()
  assert.equal(transactions.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(transactions[0].selection)), { anchor: 2, head: 4 })
  assert.equal('changes' in transactions[0], false)
  assert.equal(context.searchMatchCount.value, 2)
  context.reveal(1, true)
  assert.deepEqual(JSON.parse(JSON.stringify(transactions[1].selection)), { anchor: 5, head: 7 })
  context.reveal(2, true)
  assert.equal(context.searchMatchIndex.value, 0)
  context.reveal(-1, true)
  assert.equal(context.searchMatchIndex.value, 1)
  context.route.query = { searchLocator: '2', searchNeedle: '不在草稿中' }
  context.reveal()
  assert.equal(transactions.length, 4)
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
    scrollSearchRange: () => {},
    editorSearchMatches: actualRoot => { assert.equal(actualRoot, root); return { count: 2, rangeAt: () => range } },
    wrapSearchIndex: box.exports.wrapSearchIndex, searchMatchIndex: { value: 0 }, searchMatchCount: { value: null }, searchNavigationClosed: { value: false },
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
  context.editorSearchMatches = () => ({ count: 0, rangeAt: () => null })
  context.reveal()
  assert.equal(notices.length, 1)
})


test('navigation keeps adjacent matches separate and uses literal Unicode offsets', () => {
  const ranges = box.exports.searchRanges('🙂🙂İ预算预算', '🙂')
  assert.deepEqual(JSON.parse(JSON.stringify(ranges)), [{ from: 0, to: 2 }, { from: 2, to: 4 }])
  assert.deepEqual(JSON.parse(JSON.stringify(box.exports.searchRanges('🙂İ预算预算', '预算'))), [{ from: 3, to: 5 }, { from: 5, to: 7 }])
  assert.equal(box.exports.wrapSearchIndex(-1, 3), 2)
  assert.equal(box.exports.wrapSearchIndex(3, 3), 0)
  assert.equal(box.exports.wrapSearchIndex(1, 0), 0)
})


test('DOM matching spans inline formatting but never joins separate paragraphs', () => {
  const blockA = {}, blockB = {}
  const makeNode = (data, block) => ({ data, length: data.length, parentElement: { closest: selector => selector.startsWith('p,') ? block : null } })
  const nodes = [makeNode('预', blockA), makeNode('算', blockA), makeNode('预算', blockB)]
  box.NodeFilter = { SHOW_TEXT: 4 }
  box.document = {
    createTreeWalker: () => { let index = -1; return { nextNode: () => ++index < nodes.length, get currentNode() { return nodes[index] } } },
    createRange: () => ({ setStart(node, offset) { this.start = [node, offset] }, setEnd(node, offset) { this.end = [node, offset] } }),
  }
  const matches = box.exports.editorSearchMatches({}, '预算')
  assert.equal(matches.count, 2)
  assert.equal(matches.rangeAt(0).start[0], nodes[0])
  assert.equal(matches.rangeAt(0).end[0], nodes[1])
  assert.equal(matches.rangeAt(1).start[0], nodes[2])
  assert.equal(box.exports.editorSearchMatches({}, '算预').count, 0)
})

test('long paragraph scroll uses match geometry rather than paragraph geometry', () => {
  const scrolls = []
  const viewport = { scrollHeight: 3000, clientHeight: 400, parentElement: null,
    getBoundingClientRect: () => ({ top: 100 }), scrollBy: value => scrolls.push(value) }
  box.getComputedStyle = () => ({ overflowY: 'auto' })
  box.exports.scrollSearchRange({ startContainer: { parentElement: viewport }, getBoundingClientRect: () => ({ top: 1700 }) })
  assert.equal(scrolls[0].top, 1400)
  assert.equal(scrolls[0].behavior, 'auto')
})
