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

test('compiled shared Markdown styles preserve effects unless adaptive reduction is active', () => {
  const css = sass.compile('src/styles/vditor-content-themes.scss').css
  const rule = css.slice(css.lastIndexOf('.markdown-motion-reduced .vditor-reset,')).trim()
  assert.match(rule, /^\.markdown-motion-reduced/)
  assert.ok(css.includes('animation: twinkle 3s ease-in-out infinite'))
  assert.match(rule, /\.vditor-reset \*::before/)
  assert.match(rule, /\.vditor-reset \*::after/)
  for (const declaration of ['animation: none !important', 'transition: none !important', 'backdrop-filter: none !important']) {
    assert.ok(rule.includes(declaration))
  }
})

function frameMonitor() {
  const context = vm.createContext({ exports: {} })
  const source = fs.readFileSync('src/utils/markdownMotion.ts', 'utf8')
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  let reductions = 0
  const monitor = context.exports.createMarkdownFrameMonitor(() => reductions++)
  let now = 0
  monitor.reset(now)
  return { monitor, reductions: () => reductions,
    run(count, delta) { for (let i = 0; i < count; i++) { now += delta; monitor.frame(now) } },
    resume() { now += 60000; monitor.reset(now) } }
}

test('smooth frames keep normal effects even for a long-running document', () => {
  const m = frameMonitor(); m.run(1800, 16.7); assert.equal(m.reductions(), 0)
})
test('startup and isolated stalls do not reduce effects', () => {
  const m = frameMonitor(); m.run(10, 100); m.run(120, 16); m.run(1, 400); m.run(240, 16)
  assert.equal(m.reductions(), 0)
})
test('persistent slow frames reduce once, including severe one-FPS stalls', () => {
  for (const interval of [50, 1000]) {
    const m = frameMonitor(); m.run(160, interval); assert.equal(m.reductions(), 1)
  }
})
test('foreground resume discards background time and rewarms', () => {
  const m = frameMonitor(); m.run(45, 50); m.resume(); m.run(240, 16)
  assert.equal(m.reductions(), 0)
})

test('adaptive lifecycle preserves normal motion, degrades, resets per document and cleans up', () => {
  const events = new Map(), windowEvents = new Map(), frames = new Map(), classes = new Set()
  let now = 0, nextFrame = 0, intersection, dispose, prefChange, disconnected = false
  const root = { dataset: {}, classList: { toggle(key, active) { active ? classes.add(key) : classes.delete(key) }, remove: key => classes.delete(key) } }
  const preference = { matches: false, addEventListener(_name, fn) { prefChange = fn }, removeEventListener() { prefChange = null } }
  const document = { hidden: false, hasFocus: () => true, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) }
  const monitorContext = vm.createContext({ exports: {} })
  const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInContext(compile('src/utils/markdownMotion.ts'), monitorContext)
  const context = vm.createContext({ exports: {}, document, performance: { now: () => now },
    window: { matchMedia: () => preference, addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: name => windowEvents.delete(name) },
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame }, cancelAnimationFrame: id => frames.delete(id),
    IntersectionObserver: class { constructor(fn) { intersection = fn } observe() {} disconnect() { disconnected = true } },
    require: name => name === 'vue' ? { onUnmounted: fn => dispose = fn } : monitorContext.exports,
  })
  vm.runInContext(compile('src/composables/useAdaptiveMarkdownMotion.ts'), context)
  const api = context.exports.useAdaptiveMarkdownMotion(() => ({ vditor: { element: root } }))
  const run = (count, delta) => { for (let i = 0; i < count; i++) { now += delta; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)) } }
  api.startAdaptiveMotion(); intersection([{ isIntersecting: true }])
  run(250, 16)
  assert.equal(root.dataset.markdownMotion, 'full')
  document.hidden = true; events.get('visibilitychange')()
  assert.equal(frames.size, 0)
  now += 60000; document.hidden = false; events.get('visibilitychange')()
  run(60, 16)
  assert.equal(root.dataset.markdownMotion, 'full')
  run(120, 50)
  assert.equal(root.dataset.markdownMotion, 'reduced')
  assert.equal(root.dataset.markdownMotionReason, 'sustained-slow-frames')
  assert.equal(frames.size, 0)
  api.startAdaptiveMotion(); intersection([{ isIntersecting: true }])
  assert.equal(root.dataset.markdownMotion, 'full')
  preference.matches = true; prefChange()
  assert.equal(root.dataset.markdownMotionReason, 'preference')
  assert.equal(frames.size, 0)
  dispose()
  assert.equal(disconnected, true)
  assert.equal(events.size + windowEvents.size + frames.size + classes.size, 0)
  assert.equal(root.dataset.markdownMotion, undefined)
})
