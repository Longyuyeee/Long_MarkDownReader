import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'

// Execute the actual production scheduler, not a second implementation.
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const start = source.indexOf('// 搜索防抖')
const end = source.indexOf('watch(activeTabId,', start)
assert.ok(start >= 0 && end > start)
const javascript = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const harness = () => {
  const pending = [], timers = new Map(), box = value => ({ value })
  let timerId = 0
  const context = vm.createContext({
    searchQuery: box(''), knowledgeSearchResults: box([]), knowledgeSearchRunning: box(false), knowledgeSearchFailed: box(false),
    activeCollectionId: box(''), store: { libraryPath: 'synthetic-library' }, knowledgeSearchGeneration: 0,
    refreshRelationSummaries: async () => {}, refreshKnowledgeIndexStatus: async () => {}, refreshLibrary: () => {},
    watch: () => {}, setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id),
    invoke: (command, args) => { const request = deferred(); pending.push({ command, args, ...request }); return request.promise },
  })
  vm.runInContext(`${javascript}\nglobalThis.schedule = scheduleKnowledgeSearch; globalThis.retry = retryKnowledgeSearch`, context)
  return { context, pending, start: q => { context.searchQuery.value = q; context.schedule(q); },
    flush: () => { const callbacks = [...timers.values()]; timers.clear(); return Promise.all(callbacks.map(fn => fn())) } }
}
for (const query of ['项目', '#项目']) test(`failure and retry preserve query: ${query}`, async () => {
  const h = harness(); h.start(query); const first = h.flush()
  h.pending[0].reject(new Error('sensitive-path-must-not-be-displayed')); await first
  assert.equal(h.context.knowledgeSearchFailed.value, true)
  assert.equal(h.context.knowledgeSearchRunning.value, false)
  h.context.retry(); const second = h.flush()
  assert.deepEqual(h.pending[1].args, h.pending[0].args)
  h.pending[1].resolve([]); await second
  assert.equal(h.context.knowledgeSearchFailed.value, false)
  assert.equal(h.context.searchQuery.value, query)
})
test('successful empty response is not failure', async () => {
  const h = harness(); h.start('empty'); const done = h.flush(); h.pending[0].resolve([]); await done
  assert.equal(h.context.knowledgeSearchFailed.value, false)
  assert.equal(h.context.knowledgeSearchResults.value.length, 0)
})
for (const outcome of ['resolve', 'reject']) test(`stale ${outcome} cannot overwrite newer results`, async () => {
  const h = harness(); h.start('old'); const old = h.flush(); h.start('new'); const next = h.flush()
  h.pending[1].resolve([{ title: 'new' }]); await next
  h.pending[0][outcome](outcome === 'resolve' ? [{ title: 'old' }] : new Error('old failure')); await old
  assert.equal(h.context.knowledgeSearchResults.value[0].title, 'new')
  assert.equal(h.context.knowledgeSearchFailed.value, false)
})
test('clear invalidates pending response and clears busy state', async () => {
  const h = harness(); h.start('old'); const done = h.flush(); h.start('')
  h.pending[0].resolve([{ title: 'old' }]); await done
  assert.equal(h.context.knowledgeSearchResults.value.length, 0)
  assert.equal(h.context.knowledgeSearchRunning.value, false)
})
test('library change rejects old response', async () => {
  const h = harness(); h.start('old'); const done = h.flush(); h.context.store.libraryPath = 'other-library'
  h.pending[0].reject(new Error('old-library')); await done
  assert.equal(h.context.knowledgeSearchFailed.value, false)
  assert.equal(h.context.knowledgeSearchResults.value.length, 0)
})
test('new query immediately removes old result; missing library does not spin', () => {
  const h = harness(); h.context.knowledgeSearchResults.value = [{ title: 'old' }]; h.start('new')
  assert.equal(h.context.knowledgeSearchResults.value.length, 0)
  h.context.store.libraryPath = ''; h.start('missing')
  assert.equal(h.context.knowledgeSearchRunning.value, false)
})
test('component keeps errors distinct and offers accessible retry', () => {
  const component = fs.readFileSync('src/components/SearchFeedback.vue', 'utf8')
  assert.match(component, /v-else-if="failed"[^>]*role="alert"/)
  assert.match(component, /\$emit\('retry'\)/)
  assert.match(source, /onUnmounted\(\(\) => \{\s*\+\+knowledgeSearchGeneration/)
  assert.match(source, /watch\(\(\) => store.libraryPath, \(newPath\) => \{\s*\+\+knowledgeSearchGeneration/)
  assert.match(source, /@retry="retryKnowledgeSearch"/)
})
