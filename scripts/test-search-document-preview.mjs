import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { test } from 'node:test'
const source = fs.readFileSync('src/components/SearchDocumentPreview.vue', 'utf8')
const script = source.split('<script setup lang="ts">')[1].split('</script>')[0]
function setup() {
  const requests = [], cleanups = []
  const props = Vue.reactive({ libraryRoot: '/library', query: '预算', result: { title: 'a', path: '/library/a.md', matchKind: 'body' } })
  const scope = Vue.effectScope()
  const box = { exports: {}, defineProps: () => props, defineEmits: () => () => {},
    require: name => name === 'vue' ? { ...Vue, onMounted: () => {}, onBeforeUnmount: fn => cleanups.push(fn) }
      : name === '@tauri-apps/api/core' ? { invoke: (command, args) => new Promise((resolve, reject) => requests.push({ command, args, resolve, reject })) }
      : name.includes('searchResultPath') ? { searchResultPath: path => path } : {},
  }
  scope.run(() => vm.runInNewContext(ts.transpileModule(script + '\nglobalThis.state = { preview, loading, error, load }', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, box))
  return { props, requests, state: box.state, stop: () => { cleanups.forEach(fn => fn()); scope.stop() } }
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
