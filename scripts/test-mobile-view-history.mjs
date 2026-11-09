import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MobileViewHistory } from '../src/mobile/viewHistory.ts'
const page = (folder = '', rootId = 'local', tab = 'library') => ({ tab, rootId, folder })
const view = (query = '', scroll = 0) => ({ query, scroll, visibleCount: 160, focusKey: 'selected-file' })

test('folder and root flows restore independently without mutating a captured document origin', () => {
  const history = new MobileViewHistory()
  const origin = history.remember(page(), view('项目', 420))
  history.remember(page('项目084'), view('笔记', 80))
  history.remember(page('', 'local', 'recent'), view('', 240))
  assert.deepEqual(history.recall(page()).view, view('项目', 420))
  assert.deepEqual(history.recall(page('项目084')).view, view('笔记', 80))
  origin.view.query = 'changed outside'; origin.page.folder = 'changed outside'
  assert.equal(history.recall(page()).view.query, '项目')
  const restored = history.recall(page())
  restored.view.scroll = 0
  assert.equal(history.recall(page()).view.scroll, 420)
})
test('each granted library retains its own folder, and revocation forgets only that library', () => {
  const history = new MobileViewHistory()
  history.remember(page('项目', 'one'), view('甲', 10))
  history.remember(page('资料/章节', 'two'), view('乙', 20))
  assert.equal(history.libraryPage('one').folder, '项目')
  history.forgetLibrary('one')
  assert.equal(history.libraryPage('one').folder, '')
  assert.equal(history.recall(page('资料/章节', 'two')).view.query, '乙')
})
test('the least recently used page is evicted, with a usable default instead of stale coordinates', () => {
  const history = new MobileViewHistory(2)
  history.remember(page('a'), view('a', 1)); history.remember(page('b'), view('b', 2))
  history.recall(page('a')); history.remember(page('c'), view('c', 3))
  assert.equal(history.recall(page('a')).view.query, 'a')
  assert.deepEqual(history.recall(page('b')).view, { query: '', visibleCount: 80, scroll: 0, focusKey: '' })
  assert.equal(history.recall(page('c')).view.scroll, 3)
})
test('invalid viewport coordinates are normalized while user query text is preserved', () => {
  const history = new MobileViewHistory()
  const saved = history.remember(page(), { ...view('  原样保留  ', NaN), visibleCount: Infinity })
  assert.equal(saved.view.scroll, 0); assert.equal(saved.view.visibleCount, 80); assert.equal(saved.view.query, '  原样保留  ')
  assert.throws(() => new MobileViewHistory(0))
})

test('returning to the library root restores its last All or Recent view for the current library', () => {
  const history = new MobileViewHistory()
  history.remember(page('项目甲'), view('准备', 430))
  history.remember(page('', 'local', 'recent'), view('行程', 260))
  history.remember(page('', 'local', 'search'), view('搜索词', 180))
  assert.equal(history.peek(history.libraryPage('local')).view.query, '准备')
  assert.equal(history.librarySurface('local').tab, 'recent')
  assert.equal(history.recall(history.librarySurface('local')).view.query, '行程')
  assert.equal(history.recall(history.libraryPage('local')).view.query, '准备')
  assert.equal(history.libraryPage('local').folder, '项目甲')
  history.remember(page('另一处', 'other'), view('乙', 100))
  assert.equal(history.librarySurface('other').tab, 'library')
  history.forgetLibrary('local')
  assert.deepEqual(history.librarySurface('local'), page())
  assert.equal(history.libraryPage('other').folder, '另一处')
})

test('an evicted Recent view cannot leave a stale remembered library mode', () => {
  const history = new MobileViewHistory(2)
  history.remember(page('', 'local', 'recent'), view('行程', 260))
  history.remember(page('', 'other'), view('其他'))
  history.remember(page('', 'third'), view('第三'))
  assert.deepEqual(history.librarySurface('local'), page())
})
