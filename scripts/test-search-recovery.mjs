import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
import { createSearchPages } from '../src/services/searchPages.ts'
const queryModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/searchQuery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, queryModule)
import { createRenderer, effectScope, nextTick, onUnmounted, reactive, ref, watch } from 'vue'

// Execute the actual production scheduler, not a second implementation.
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const start = source.indexOf('// 搜索防抖')
const end = source.indexOf('watch(activeTabId,', start)
assert.ok(start >= 0 && end > start)
const javascript = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const libraryStart = source.indexOf('watch(() => store.libraryPath, (newPath) => {')
const libraryEnd = source.indexOf('// 从设置页返回后刷新 Git 状态', libraryStart)
assert.ok(libraryStart >= 0 && libraryEnd > libraryStart)
const libraryJavascript = ts.transpileModule(source.slice(libraryStart, libraryEnd), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const unmountStart = source.indexOf('onUnmounted(() => {')
const unmountEnd = source.indexOf('watch(activeSidebarTab,', unmountStart)
assert.ok(unmountStart >= 0 && unmountEnd > unmountStart)
const unmountJavascript = ts.transpileModule(source.slice(unmountStart, unmountEnd), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const harness = (vueWatchers = false) => {
  const pending = [], timers = new Map(), box = vueWatchers ? ref : value => ({ value })
  const scope = effectScope()
  let timerId = 0
  const noop = () => {}
  const context = vm.createContext({
    libraryLoadError: box(''), treeData: box([]), libraryLoadGeneration: 0,
    tagsGeneration: 0, tagsRoot: '', allTags: box([]), tagsError: box(''), tagsLoading: box(false),
    parseSearchQuery: queryModule.exports.parseSearchQuery,
    searchQuery: box(''), knowledgeSearchResults: box([]), knowledgeSearchRunning: box(false), knowledgeSearchFailed: box(false), knowledgeSearchError: box(''),
    activeCollectionId: box(''), store: reactive({ libraryPath: 'synthetic-library' }), knowledgeSearchGeneration: 0,
    knowledgeSort: box('relevance'), restoreSearchFiles:0, searchReturn:{reconcile:()=>{}},
    activeGraphCollection:box(null),
    relationSummaries: box({}), searchObjectTypes: box(['markdown']),
    fetchLibStats: () => {}, fetchAllTags: () => {}, refreshGitStatus: () => {},
    refreshRelationSummaries: async () => {}, refreshKnowledgeIndexStatus: async () => {}, refreshLibrary: () => {},
    watch: vueWatchers ? watch : () => {}, setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id),
    invoke: (command, args) => { const request = deferred(); pending.push({ command, args, ...request }); return request.promise },
    onUnmounted, editorLoadGeneration: 0, destroyImageFix: noop, refreshAfterFileMove: noop, window: { removeEventListener: noop },
    document: { removeEventListener: noop }, rememberReferenceInsertionPoint: noop,
    closeHistoryComparison: noop, invalidateHistory: noop,
    // The production unmount now also retires file dragging. This scheduler
    // harness supplies that separate dependency; search assertions stay intact.
    resetFileDrag: noop,
    onPaletteSearchReference:noop,
    revealLibraryFile: noop, refreshCreatedLibraryFile: noop, handleKeyDown: noop,
    shadowSaveTimer: null, gitStatusTimer: null, cleanupEditorListeners: noop, destroyOutlineObserver: noop,
    unlistenRefresh: null, unlistenExport: null, unlistenRefreshCmd: null, unlistenSaveCmd: null,
    unlistenDailyNote: null, unlistenFocus: null, unlistenDrop: null, vditor: null,
  })
  const protocolInvoke = (command, nativeArgs) => {
    if(command==='close_knowledge_search')return Promise.resolve(true)
    assert.equal(command,'search_knowledge_page','the actual scheduler must use the new page API, including tags')
    const request=deferred(),args=nativeArgs.request
    pending.push({command,args,nativeArgs,reject:request.reject,resolve:results=>request.resolve({sessionId:'native-'+pending.length,snapshotId:'snapshot',files:results.map(result=>{
      const match={path:'synthetic-library/'+result.title,objectType:'markdown',matchKind:'body',context:'project',score:60,extractionFailed:false,...result}
      return {path:match.path,title:match.title,matches:[match],mayHaveMoreMatches:false,locationLimitPerKind:5,unlocatedLimitPerKind:1}
    }),pageOffset:0,nextCursor:null,scanState:'ready',scanComplete:true,totalFiles:results.length})})
    return request.promise
  }
  context.knowledgePages=createSearchPages(protocolInvoke,{autoMs:0})
  context.tagSearch={get value(){return /^#[^\s"]+$/.test(context.searchQuery.value.trim())}}
  const fileWatchStart=source.indexOf('watch(knowledgePages.files,'),fileWatchEnd=source.indexOf('const searchViewport',fileWatchStart)
  assert.ok(fileWatchStart>=0 && fileWatchEnd>fileWatchStart)
  const fileWatchJavascript=ts.transpileModule(source.slice(fileWatchStart,fileWatchEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  const run = () => vm.runInContext(`${vueWatchers ? fileWatchJavascript : ''}\n${javascript}\n${vueWatchers ? libraryJavascript : ''}\n${vueWatchers === 'component' ? unmountJavascript : ''}\nglobalThis.schedule = scheduleKnowledgeSearch; globalThis.retry = retryKnowledgeSearch`, context)
  let app
  if (vueWatchers === 'component') {
    const renderer = createRenderer({ createComment: () => ({}), createText: () => ({}), createElement: () => ({}),
      insert: noop, remove: noop, setText: noop, setElementText: noop, patchProp: noop, parentNode: () => null, nextSibling: () => null })
    app = renderer.createApp({ setup() { run(); return () => null } }); app.mount({})
  } else scope.run(run)
  return { context, pending, stop: () => { app?.unmount(); scope.stop() }, start: q => { context.searchQuery.value = q; if (!vueWatchers) context.schedule(q); },
    flush: () => { const callbacks = [...timers.values()]; timers.clear(); return Promise.all(callbacks.map(fn => fn())) } }
}
for (const query of ['项目', '#项目']) test(`failure and retry preserve query: ${query}`, async () => {
  const h = harness(); h.start(query); const first = h.flush()
  h.pending[0].reject(new Error('sensitive-path-must-not-be-displayed')); await first
  assert.equal(h.context.knowledgeSearchFailed.value, true)
  assert.equal(h.context.knowledgeSearchError.value, '', 'native error details must not become the default search message')
  assert.equal(h.context.knowledgeSearchRunning.value, false)
  const second = h.context.retry()
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
  assert.match(source.slice(unmountStart, unmountEnd), /\+\+knowledgeSearchGeneration/)
  assert.match(source.slice(libraryStart, libraryEnd), /\+\+knowledgeSearchGeneration/)
  assert.match(source, /@retry="retryKnowledgeSearch"/)
})

test('real Vue watchers debounce changes and retry retains format filter', async () => {
  const h = harness(true)
  try {
    h.start('old'); h.start('项目'); await nextTick()
    const done = h.flush(); assert.equal(h.pending.length, 1)
    assert.equal(h.pending[0].args.query, '项目')
    h.pending[0].reject(new Error('synthetic')); await done
    const retry = h.context.retry()
    h.pending[1].resolve([{ title: 'found' }]); await retry
    assert.equal(h.context.knowledgeSearchResults.value[0].title, 'found')
    assert.equal(h.context.searchObjectTypes.value[0], 'markdown')
  } finally { h.stop() }
})
test('real library watcher clears query, collection and busy state before late response', async () => {
  const h = harness(true)
  try {
    h.start('项目'); await nextTick(); const done = h.flush()
    h.context.activeCollectionId.value = 'old-collection'
    h.context.store.libraryPath = 'other-library'; await nextTick()
    assert.equal(h.context.searchQuery.value, '')
    assert.equal(h.context.activeCollectionId.value, '')
    assert.equal(h.context.knowledgeSearchRunning.value, false)
    h.pending[0].reject(new Error('old library')); await done
    assert.equal(h.context.knowledgeSearchFailed.value, false)
    assert.equal(h.context.knowledgeSearchResults.value.length, 0)
  } finally { h.stop() }
})
test('real Vue clear cancels debounce without invoking backend', async () => {
  const h = harness(true)
  try {
    h.start('项目'); await nextTick(); h.start(''); await nextTick(); await h.flush()
    assert.equal(h.pending.length, 0)
    assert.equal(h.context.knowledgeSearchRunning.value, false)
  } finally { h.stop() }
})
test('real Vue unmount cancels scheduled search', async () => {
  const h = harness('component'); h.start('项目'); await nextTick(); h.stop(); await h.flush()
  assert.equal(h.pending.length, 0)
})
test('real Vue unmount invalidates a late response', async () => {
  const h = harness('component'); h.start('项目'); await nextTick(); const done = h.flush()
  h.stop(); h.pending[0].resolve([{ title: 'late' }]); await done
  assert.equal(h.context.knowledgeSearchResults.value.length, 0)
})
