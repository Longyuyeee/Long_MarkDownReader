import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { test } from 'node:test'
const source = fs.readFileSync('src/components/SearchDocumentPreview.vue', 'utf8')
const script = source.split('<script setup lang="ts">')[1].split('</script>')[0]
function setup() {
  const requests = [], cleanups = [], copied = []
  const props = Vue.reactive({ libraryRoot: '/library', query: '预算', result: { title: 'a', path: '/library/a.md', matchKind: 'body' } })
  const scope = Vue.effectScope()
  const box = { exports: {}, navigator: { clipboard: { writeText: async text => copied.push(text) } }, defineProps: () => props, defineEmits: () => () => {},
    require: name => name === 'vue' ? { ...Vue, onMounted: () => {}, onBeforeUnmount: fn => cleanups.push(fn) }
      : name === '@tauri-apps/api/core' ? { invoke: (command, args) => new Promise((resolve, reject) => requests.push({ command, args, resolve, reject })) }
      : name.includes('sourceExcerpt') ? { sourceExcerpt: (text, source) => `${text}\n来源：${source.path}` }
      : name.includes('searchResultPath') ? { searchResultPath: path => path } : {},
  }
  scope.run(() => vm.runInNewContext(ts.transpileModule(script + '\nglobalThis.state = { preview, loading, error, load, selectedText, copyExcerpt, copyStatus }', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, box))
  return { props, requests, copied, clipboard: box.navigator.clipboard, state: box.state, stop: () => { cleanups.forEach(fn => fn()); scope.stop() } }
}
const settle = async () => { await Promise.resolve(); await Vue.nextTick(); await Promise.resolve() }
test('switching results never displays late content from the previous file', async () => {
  const h = setup()
  assert.equal(h.requests[0].command, 'preview_search_document')
  h.props.result = { title: 'b', path: '/library/b.pdf', page: 4, matchKind: 'body' }
  await Vue.nextTick()
  assert.equal(h.requests[1].args.page, 4)
  h.requests[1].resolve({ text: '正确页面', label: '第4页', matchFound: true, truncated: false })
  await settle()
  h.requests[0].resolve({ text: '旧文档' }); await settle()
  assert.equal(h.state.preview.value.text, '正确页面')
  assert.equal(h.state.loading.value, false)
  h.stop()
})
test('failed preview can retry; closing discards pending responses', async () => {
  const h = setup()
  h.requests[0].reject('文件已移动'); await settle()
  assert.match(h.state.error.value, /文件已移动/)
  const retry = h.state.load()
  assert.equal(h.state.error.value, '')
  h.stop()
  h.requests[1].resolve({ text: '迟到结果' }); await retry
  assert.equal(h.state.preview.value, null)
})


test('excerpt uses selected text and resets on a different source', async () => {
  const h = setup()
  h.requests[0].resolve({ text: '整段内容', label: 'Markdown', matchFound: true, truncated: false })
  await settle()
  h.state.selectedText.value = '选中部分'
  await h.state.copyExcerpt()
  assert.equal(h.copied[0], '选中部分\n来源：/library/a.md')
  h.props.result = { path: '/library/b.md', title: 'b', matchKind: 'body' }
  await settle()
  assert.equal(h.state.selectedText.value, '')
  assert.equal(h.state.copyStatus.value, '')
  h.stop()
})


test('clipboard failure keeps the selection for retry', async () => {
  const h = setup()
  h.state.selectedText.value = '保留摘录'
  h.clipboard.writeText = async () => { throw new Error('denied') }
  await h.state.copyExcerpt()
  assert.match(h.state.copyStatus.value, /复制失败/)
  assert.equal(h.state.selectedText.value, '保留摘录')
  h.clipboard.writeText = async text => h.copied.push(text)
  await h.state.copyExcerpt()
  assert.match(h.state.copyStatus.value, /已复制/)
  h.stop()
})

test('explicit side reference docks immediately, survives searches and clears on library change', async () => {
  const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const handler = source.slice(source.indexOf('const referencePinned ='), source.indexOf('const openSearchPreview ='))
  const scope = Vue.effectScope()
  const context = { ref: Vue.ref, computed: Vue.computed, watch: Vue.watch, searchQuery: Vue.ref('预算'), searchObjectTypes: Vue.ref([]),
    activeSidebarTab: Vue.ref('files'), searchPreviewResult: Vue.ref(null), store: Vue.reactive({ libraryPath: '/a' }) }
  scope.run(() => vm.runInNewContext(ts.transpileModule(handler + '\nglobalThis.state = { referencePinned, searchPreviewQuery, showSearchPreview }', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context))
  const result = { path: '/a/note.md', title: 'note', matchKind: 'body' }
  context.state.showSearchPreview(result)
  assert.equal(context.state.referencePinned.value, true)
  context.searchQuery.value = '计划'
  context.activeSidebarTab.value = 'outline'
  await Vue.nextTick()
  assert.equal(context.searchPreviewResult.value.path, result.path)
  assert.equal(context.state.searchPreviewQuery.value, '预算')
  context.state.showSearchPreview({ path: '/a/other.md', title: 'other', matchKind: 'body' })
  assert.equal(context.searchPreviewResult.value.path, '/a/other.md')
  assert.equal(context.state.searchPreviewQuery.value, '计划')
  context.store.libraryPath = '/b'
  await Vue.nextTick()
  assert.equal(context.searchPreviewResult.value, null)
  assert.equal(context.state.referencePinned.value, false)
  scope.stop()
})

test('normal result opens use main document navigation and never replace the reference', () => {
  const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const handler = library.slice(library.indexOf('const openKnowledgeSearchResult ='), library.indexOf('const handleLoadChildren ='))
  const calls = []
  const reference = { path: '/a/reference.md' }
  const context = { searchReturn: { remember: key => calls.push(['remember', key]) }, searchMatchKey: r => r.path,
    router: {}, searchQuery: { value: '预算' }, searchNavigationSequence: 0, searchPreviewResult: { value: reference },
    openManagedFile: (...args) => calls.push(['file', ...args]), openManagedObject: (...args) => calls.push(['object', ...args]),
    routeForFile: () => null, opensInLibraryShell: () => true, findFileFormat: () => 'markdown', handleNodeSelect: paths => calls.push(['select', paths]),
  }
  vm.runInNewContext(ts.transpileModule(handler + '\nglobalThis.open = openKnowledgeSearchResult', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  context.open({ path: '/a/note.md', objectType: 'markdown', matchKind: 'body' })
  assert.equal(calls.at(-1)[0], 'file'); assert.equal(calls.at(-1)[2], '/a/note.md')
  assert.equal(calls.at(-1)[3].searchNeedle, '预算')
  context.open({ path: '/a/data.pdf', objectType: 'pdf', page: 4 })
  assert.equal(calls.at(-1)[0], 'object'); assert.equal(calls.at(-1)[2].page, 4)
  context.open({ path: '/a/title.md', objectType: 'markdown', matchKind: 'filename' })
  assert.equal(calls.at(-1)[0], 'select')
  assert.equal(context.searchPreviewResult.value, reference)
  assert.doesNotMatch(handler, /showSearchPreview|searchPreviewResult\s*\./)
})

test('main open and side reference remain distinct accessible actions', () => {
  const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  assert.match(library, /@click="openKnowledgeSearchResult\(result\)"/)
  assert.match(library, /@click="showSearchPreview\(result\)">在侧边参考/)
  assert.doesNotMatch(source, /固定为参考|取消固定|\$emit\('pin'\)/)
  assert.match(source, /在主编辑区打开/)
  assert.match(source, /返回编辑/)
  assert.match(source, /关闭参考/)
})

test('arrow keys move between main-open actions without opening files or swallowing Enter', () => {
  const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const start = library.indexOf('const navigateSearchResults =')
  const handler = library.slice(start, library.indexOf('const knowledgeSearchRunning =', start))
  const context = {}
  vm.runInNewContext(ts.transpileModule(handler + '\nglobalThis.navigate = navigateSearchResults', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  let focused = -1, prevented = 0
  const buttons = [0, 1, 2].map(index => ({ focus: () => { focused = index } }))
  const event = (key, index, matches = true) => ({ key, currentTarget: { querySelectorAll: () => buttons }, target: {
    matches: () => matches, closest: () => ({ querySelector: () => buttons[index] }),
  }, preventDefault: () => { prevented++ } })
  context.navigate(event('ArrowDown', 0)); assert.equal(focused, 1)
  context.navigate(event('ArrowUp', 1)); assert.equal(focused, 0)
  context.navigate(event('ArrowUp', 0)); assert.equal(focused, 0)
  context.navigate(event('ArrowDown', 2)); assert.equal(focused, 2)
  assert.equal(prevented, 4)
  context.navigate(event('Enter', 1))
  context.navigate(event('ArrowDown', 1, false))
  context.navigate({ ...event('ArrowDown', 1), isComposing: true })
  context.navigate({ ...event('ArrowDown', 1), ctrlKey: true })
  assert.equal(prevented, 4)
})

test('explicit return closes the reference and focuses a visible writable editor after rendering', async () => {
  const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const handler = library.slice(library.indexOf('const returnToEditorFromReference ='), library.indexOf('const showSearchPreview ='))
  const order = []
  const hidden = { getClientRects: () => [], matches: () => false, focus: () => assert.fail('hidden editor') }
  const readonly = { getClientRects: () => [1], matches: () => true, focus: () => assert.fail('readonly editor') }
  const writable = { getClientRects: () => [1], matches: () => false, focus: () => order.push('focus') }
  const editor = { querySelectorAll: () => [hidden, readonly, writable], focus: () => order.push('fallback') }
  const context = { searchPreviewResult: { value: {} }, nextTick: async () => order.push('render'), document: { querySelector: () => editor } }
  vm.runInNewContext(ts.transpileModule(handler + '\nglobalThis.run = returnToEditorFromReference', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  await context.run()
  assert.equal(context.searchPreviewResult.value, null)
  assert.deepEqual(order, ['render', 'focus'])
  editor.querySelectorAll = () => []
  await context.run()
  assert.equal(editor.tabIndex, -1)
  assert.equal(order.at(-1), 'fallback')
  assert.match(source, /@click="\$emit\('returnToEditor'\)"/)
})
