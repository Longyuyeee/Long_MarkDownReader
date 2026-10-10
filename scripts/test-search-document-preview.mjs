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


test('excerpt uses selected text and resets on a different source, pinning does not reload', async () => {
  const h = setup()
  h.requests[0].resolve({ text: '整段内容', label: 'Markdown', matchFound: true, truncated: false })
  await settle()
  h.state.selectedText.value = '选中部分'
  await h.state.copyExcerpt()
  assert.equal(h.copied[0], '选中部分\n来源：/library/a.md')
  h.props.pinned = true
  await settle()
  assert.equal(h.requests.length, 1)
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

test('pinned reference retains its query across searches and resets on library change', async () => {
  const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const handler = source.slice(source.indexOf('const referencePinned ='), source.indexOf('const openSearchPreview ='))
  const scope = Vue.effectScope()
  const context = { ref: Vue.ref, watch: Vue.watch, searchQuery: Vue.ref('预算'), searchObjectTypes: Vue.ref([]),
    activeSidebarTab: Vue.ref('files'), searchPreviewResult: Vue.ref(null), store: Vue.reactive({ libraryPath: '/a' }) }
  scope.run(() => vm.runInNewContext(ts.transpileModule(handler + '\nglobalThis.state = { referencePinned, searchPreviewQuery, showSearchPreview }', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context))
  const result = { path: '/a/note.md', title: 'note', matchKind: 'body' }
  context.state.showSearchPreview(result)
  context.state.referencePinned.value = true
  context.searchQuery.value = '计划'
  context.activeSidebarTab.value = 'outline'
  await Vue.nextTick()
  assert.equal(context.searchPreviewResult.value.path, result.path)
  assert.equal(context.state.searchPreviewQuery.value, '预算')
  context.store.libraryPath = '/b'
  await Vue.nextTick()
  assert.equal(context.searchPreviewResult.value, null)
  assert.equal(context.state.referencePinned.value, false)
  scope.stop()
})
