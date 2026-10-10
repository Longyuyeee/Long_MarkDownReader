import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
import { compile as compileTemplate } from '@vue/compiler-dom'
import * as Vue from 'vue'
import { renderToString } from '@vue/server-renderer'
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const load = path => {
  const box = { exports: {} }
  vm.runInNewContext(compile(fs.readFileSync(path, 'utf8')), box)
  return box.exports
}
const { groupSearchResults, searchMatchKey } = load('src/utils/searchResultGroups.ts')
const plain = value => JSON.parse(JSON.stringify(value))
const result = (path, page, extra = {}) => ({ path, title: '同名.pdf', objectType: 'pdf', matchKind: 'body', page, context: '预算', ...extra })

test('same file pages group together without merging same-named files or losing ranking', () => {
  const a = result('/A/同名.pdf', 2), b = result('/B/同名.pdf', 1), c = result('/A/同名.pdf', 5)
  const groups = groupSearchResults([a, b, c, a])
  assert.deepEqual(plain(groups.map(g => [g.path, g.results.map(r => r.page)])), [['/A/同名.pdf', [2, 5]], ['/B/同名.pdf', [1]]])
  assert.equal(groups[0].results[1], c)
})
test('separate annotations and match kinds on one page remain independently accessible', () => {
  const items = [result('/x', 1), result('/x', 1, { matchKind: 'ocr' }),
    result('/x', 1, { annotationId: 'a', matchKind: 'annotation' }),
    result('/x', 1, { annotationId: 'b', matchKind: 'annotation' })]
  assert.equal(groupSearchResults(items)[0].results.length, 4)
  assert.equal(new Set(items.map(searchMatchKey)).size, 4)
})
test('unlocated contexts and case-sensitive paths are preserved', () => {
  const items = [result('/Notes/a', undefined), result('/notes/a', undefined), result('/Notes/a', undefined, { context: '另一处' })]
  assert.equal(groupSearchResults(items).length, 2)
  assert.equal(groupSearchResults(items)[0].results.length, 2)
  assert.deepEqual(plain(groupSearchResults([])), [])
})
test('actual result click forwards each PDF page and annotation to the existing router', () => {
  const navigation = load('src/services/fileNavigation.ts')
  const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const handler = source.slice(source.indexOf('const openKnowledgeSearchResult ='), source.indexOf('const handleLoadChildren ='))
  const routes = []
  const box = { searchReturn: { remember: () => {} }, searchMatchKey, openManagedObject: navigation.openManagedObject, router: { replace: value => routes.push(value) } }
  vm.runInNewContext(compile(handler + '\nglobalThis.openResult = openKnowledgeSearchResult'), box)
  for (const hit of [result('/x.pdf', 2), result('/x.pdf', 5), result('/x.pdf', 5, { annotationId: 'note-2' })]) box.openResult(hit)
  assert.deepEqual(plain(routes.map(r => r.query)), [{ page: '2', path: '/x.pdf' }, { page: '5', path: '/x.pdf' }, { page: '5', annotation: 'note-2', path: '/x.pdf' }])
})

test('actual grouped results template exposes separate page actions and bounded-count wording', async () => {
  const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const start = source.indexOf('<p v-if="!knowledgeSearchRunning')
  const end = source.indexOf('</section>', start) + '</section>'.length
  assert.ok(start > 0 && end > start)
  const render = new Function('Vue', compile(compileTemplate(source.slice(start, end), { mode: 'function', prefixIdentifiers: true, expressionPlugins: ['typescript'] }).code))(Vue)
  const items = [result('/a/report.pdf', 2), result('/b/report.pdf', 1), result('/a/report.pdf', 5)]
  const app = Vue.createSSRApp({ render, setup: () => ({
    knowledgeSearchRunning: false, knowledgeSearchFailed: false,
    groupedKnowledgeSearchResults: groupSearchResults(items), searchMatchKey,
    searchReturn: { selectedKey: { value: '' } },
    store: { libraryPath: '/' }, searchResultPath: path => path,
    searchQuery: '预算', resultFormatLabel: () => 'PDF', searchKindLabel: () => '正文',
    relationSummary: () => null, openKnowledgeSearchResult: () => {}, openRelationGraph: () => {},
  }) })
  app.component('SearchHighlight', { props: ['text'], render() { return Vue.h('span', this.text) } })
  app.component('RelationSummaryBadge', { render: () => null })
  const html = await renderToString(app)
  assert.equal((html.match(/class="knowledge-result-group"/g) || []).length, 2)
  assert.equal((html.match(/class="knowledge-result-open"/g) || []).length, 3)
  assert.ok(html.includes('第 2 页') && html.includes('第 5 页'))
  assert.ok(html.includes('不代表全部匹配次数'))
  assert.ok(html.includes('同一文件 · 2 条结果'))
})


test('body results carry a fresh location intent on repeated opens', () => {
  const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const handler = source.slice(source.indexOf('let searchNavigationSequence ='), source.indexOf('const handleLoadChildren ='))
  const routes = []
  const box = { searchReturn: { remember: () => {} }, searchMatchKey, searchQuery: { value: '预算' },
    openManagedFile: (_router, path, query) => routes.push({ path, query }), router: {} }
  vm.runInNewContext(compile(handler + '\nglobalThis.openResult = openKnowledgeSearchResult'), box)
  for (const objectType of ['markdown', 'plain-text', 'plain-text']) box.openResult({ path: '/draft.txt', objectType, matchKind: 'body' })
  assert.equal(routes.length, 3)
  assert.equal(routes[0].query.searchNeedle, '预算')
  assert.notEqual(routes[1].query.searchLocator, routes[2].query.searchLocator)
})
