import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSearchPages } from '../src/services/searchPages.ts'

const definition = () => ({ libraryRoot: 'C:/library', query: '', sort: 'name', channel: 'collection', kind: 'collection', objectTypes: ['markdown'],
  filters: { directory: 'project', tag: '项目', tags: ['工作'], modifiedWithinDays: 7 } })
const match = n => ({ path: `C:/library/project/${n}.md`, title: `${n}.md`, objectType: 'markdown', matchKind: 'title', context: '符合集合条件', score: 100, extractionFailed: false })
const frame = (offset = 0, count = 40, extra = {}) => ({ sessionId: 'collection', snapshotId: 'snapshot', files: Array.from({ length: count }, (_, i) => ({ path: match(i + offset).path, title: match(i + offset).title, matches: [match(i + offset)] })),
  pageOffset: offset, nextCursor: offset + count < 244 ? `p:${offset + count}` : null, scanState: 'ready', scanComplete: true, totalFiles: 244, ...extra })
function harness(handler) {
  const calls = [], closes = []
  const pages = createSearchPages(async (command, args) => {
    if (command === 'close_knowledge_search') { closes.push(args); return true }
    calls.push({ command, args }); return handler(args.request, calls.length)
  }, { autoMs: 0 })
  return { pages, calls, closes }
}
test('empty-keyword collections call their real scoped command and page beyond 200 files without losing file-group locators', async () => {
  const h = harness(request => { const offset = Number(request.cursor?.slice(2) || 0); return frame(offset, Math.min(40, 244 - offset)) })
  const def = definition(); await h.pages.start(def)
  def.filters.tags.push('尚未提交'); def.objectTypes.push('pdf')
  while (h.pages.hasMore.value) await h.pages.loadMore()
  assert.equal(h.pages.files.value.length, 244); assert.equal(new Set(h.pages.files.value.map(file => file.path)).size, 244)
  for (const { command, args } of h.calls) {
    assert.equal(command, 'search_collection_page'); assert.equal(args.request.query, ''); assert.equal(args.request.sort, 'name')
    assert.deepEqual(args.request.filters.tags, ['工作']); assert.deepEqual(args.request.objectTypes, ['markdown'])
    assert.equal('channel' in args.request, false); assert.equal('matchMode' in args.request, false)
  }
  h.pages.dispose(); assert.equal(h.closes.at(-1).channel, 'collection')
})
test('refresh failure retains file cards but retires old cursors; a complete empty refresh alone clears them', async () => {
  let fail = false, empty = false
  const h = harness(() => { if (fail) throw { code: 'scopeUnavailable' }; return empty ? frame(0, 0, { totalFiles: 0, nextCursor: null }) : frame() })
  await h.pages.start(definition()); fail = true; await h.pages.restart()
  assert.equal(h.pages.files.value.length, 40); assert.equal(h.pages.retainingView.value, true); assert.equal(h.pages.nextPage.value, null)
  assert.ok(h.pages.error.value); fail = false; empty = true; await h.pages.restart()
  assert.equal(h.pages.files.value.length, 0); assert.equal(h.pages.status.value.totalFiles, 0); h.pages.dispose()
})
test('a new collection cannot absorb a late old response or sort another query locally', async () => {
  let resolve; const pending = new Promise(done => { resolve = done })
  const h = harness((request, n) => n === 1 ? pending : frame(0, 1, { sessionId: 'new', snapshotId: 'new', nextCursor: null, totalFiles: 1 }))
  const old = h.pages.start(definition()); const next = definition(); next.sort = 'modified'; next.filters.tag = '新项目'
  await h.pages.start(next); resolve(frame()); await old
  assert.equal(h.pages.files.value.length, 1); assert.equal(h.calls.at(-1).args.request.sort, 'modified')
  assert.equal(h.calls.at(-1).args.request.filters.tag, '新项目'); assert.ok(h.closes.some(call => call.sessionId === 'collection')); h.pages.dispose()
})
