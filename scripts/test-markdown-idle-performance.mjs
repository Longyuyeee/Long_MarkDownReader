import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { ref, computed } from 'vue'
import { test } from 'node:test'
import * as sass from 'sass'

const source = fs.readFileSync('src/composables/useOutline.ts', 'utf8')
function outline() {
  const timers = new Map()
  const observers = []
  let nextTimer = 0
  const headings = [{ id: 'first', tagName: 'H2', textContent: 'Title', getAttribute: () => null,
    get innerText() { throw Error('Outline must not force layout') } }]
  const editor = { vditor: { wysiwyg: { element: { querySelectorAll: () => headings } } } }
  const context = vm.createContext({ ref, computed, exports: {},
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer },
    clearTimeout: id => timers.delete(id),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this) }
      observe() {}
      disconnect() { this.disconnected = true }
    },
  })
  const compiled = ts.transpileModule(source.replace(/^import .*$/gm, '').replace('export function', 'function'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  vm.runInContext(compiled + '\nglobalThis.create = useOutline', context)
  return { api: context.create(() => editor), headings, observers, timers,
    flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()) } }
}

test('outline reads text without layout and preserves unchanged tree identity', () => {
  const { api, headings } = outline()
  api.syncOutlineManual()
  const items = api.outlineItems.value
  const tree = api.outlineTreeData.value
  api.syncOutlineManual()
  assert.equal(api.outlineItems.value, items)
  assert.equal(api.outlineTreeData.value, tree)
  headings[0].textContent = 'Edited title'
  api.syncOutlineManual()
  assert.equal(api.outlineTreeData.value[0].label, 'Edited title')
})

test('rapid mutations coalesce and destroy cancels stale refresh work', () => {
  const { api, observers, timers, flush } = outline()
  let refreshed = 0
  api.setupOutlineObserver(() => refreshed++)
  for (let i = 0; i < 30; i++) observers[0].callback()
  assert.equal(timers.size, 1)
  flush()
  assert.equal(refreshed, 1)
  observers[0].callback()
  api.destroyOutlineObserver()
  assert.equal(timers.size, 0)
  assert.equal(observers[0].disconnected, true)
  flush()
  assert.equal(refreshed, 1)
})

test('replacing an outline observer disconnects the previous document', () => {
  const { api, observers, timers } = outline()
  api.setupOutlineObserver()
  observers[0].callback()
  api.setupOutlineObserver()
  assert.equal(observers[0].disconnected, true)
  assert.equal(observers[1].disconnected, false)
  assert.equal(timers.size, 0)
})

for (const view of ['LibraryMode', 'TempMode']) {
  test(`${view} stops observation while the outline is hidden`, () => {
    const text = fs.readFileSync(`src/views/${view}.vue`, 'utf8')
    const start = text.indexOf('const refreshVisibleOutline =')
    const end = text.indexOf('\nwatch(', start)
    let scans = 0, starts = 0, stops = 0
    const context = vm.createContext({
      activeSidebarTab: { value: 'files' }, isSidebarCollapsed: { value: false }, store: { isZen: false },
      showOutline: { value: false }, vditor: {},
      destroyOutlineObserver: () => stops++, syncOutlineManual: () => scans++, setupOutlineObserver: () => starts++,
    })
    vm.runInContext(text.slice(start, end) + '\nglobalThis.refresh = refreshVisibleOutline', context)
    context.refresh()
    assert.equal(starts, 0)
    context.activeSidebarTab.value = 'outline'
    context.showOutline.value = true
    context.refresh()
    assert.equal(scans, 1)
    assert.equal(starts, 1)
    if (view === 'LibraryMode') context.store.isZen = true
    else context.showOutline.value = false
    context.refresh()
    assert.equal(starts, 1)
    assert.equal(stops, 3)
  })
}

test('compiled shared Markdown styles disable decorative animation and backdrop work', () => {
  const css = sass.compile('src/styles/vditor-content-themes.scss').css
  const rule = css.slice(css.lastIndexOf('.vditor-reset,')).trim()
  assert.match(rule, /\.vditor-reset \*::before/)
  assert.match(rule, /\.vditor-reset \*::after/)
  for (const declaration of ['animation: none !important', 'transition: none !important', 'backdrop-filter: none !important']) {
    assert.ok(rule.includes(declaration))
  }
})
