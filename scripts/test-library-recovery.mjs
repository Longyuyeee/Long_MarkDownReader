import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'

const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const settings = fs.readFileSync('src/views/SettingsView.vue', 'utf8')
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const box = value => ({ value })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function loader() {
  const requests = []
  const ctx = vm.createContext({
    store: { libraryPath: 'library-a' }, treeData: box(['old']), libraryLoadError: box(''),
    libraryLoading: box(false), libraryCreating: box(false), libraryLoadGeneration: 0,
    loadDirectory: path => { const task = deferred(); requests.push({ path, ...task }); return task.promise },
    invoke: async () => {},
    fetchLibStats: async () => {}, fetchAllTags: async () => {}, refreshKnowledgeIndexStatus: async () => {},
  })
  vm.runInContext(compile(source.slice(source.indexOf('const refreshLibrary = async'), source.indexOf('const revealLibraryFile = async')) + '\nglobalThis.refresh = refreshLibrary; globalThis.create = createMissingLibraryDirectory'), ctx)
  return { ctx, requests }
}
test('unavailable root is handled locally; retry restores the file tree', async () => {
  const { ctx, requests } = loader()
  let indexRefreshes = 0
  ctx.refreshKnowledgeIndexStatus = async () => { indexRefreshes++ }
  const first = ctx.refresh()
  requests[0].reject(new Error('目录不可用'))
  await first
  assert.match(ctx.libraryLoadError.value, /目录不可用/)
  assert.equal(ctx.treeData.value.length, 0)
  assert.equal(ctx.libraryLoading.value, false)
  const retry = ctx.refresh()
  requests[1].resolve(['note.md'])
  await retry
  assert.equal(ctx.libraryLoadError.value, '')
  assert.deepEqual(ctx.treeData.value, ['note.md'])
  assert.equal(indexRefreshes, 1)
})
test('a late failure from the old library cannot replace the new library', async () => {
  const { ctx, requests } = loader()
  const first = ctx.refresh()
  ctx.store.libraryPath = 'library-b'
  const second = ctx.refresh()
  requests[1].resolve(['b.md'])
  await second
  requests[0].reject('old offline root')
  await first
  assert.deepEqual(ctx.treeData.value, ['b.md'])
  assert.equal(ctx.libraryLoadError.value, '')
})
test('explicit creation failure stays recoverable and does not escape to global errors', async () => {
  const { ctx } = loader()
  ctx.invoke = async () => { throw new Error('access denied') }
  await ctx.create()
  assert.match(ctx.libraryLoadError.value, /access denied/)
  assert.equal(ctx.libraryCreating.value, false)
})
function creation(prepare = async () => 'C:/new/library', persist = async () => {}) {
  const ctx = vm.createContext({
    newLib: { name: '新知识库', path: 'C:/new/library' }, libraryAdding: box(false), libraryAddError: box(''),
    config: box({ libraries: [], activeLibraryPath: '' }),
    store: { libraries: [], activeLibraryPath: '', updateConfig: persist },
    saveDebounce: null, clearTimeout, nextTick: async () => {},
    invoke: prepare, message: { warning() {}, success() {} },
  })
  vm.runInContext(compile(settings.slice(settings.indexOf('const addLibrary = async'), settings.indexOf('const removeLibrary =')) + '\nglobalThis.add = addLibrary'), ctx)
  return ctx
}
test('directory preparation completes before a library is registered or persisted', async () => {
  const pending = deferred()
  let persisted = false
  const ctx = creation(() => pending.promise, async () => { persisted = true })
  const work = ctx.add()
  assert.equal(ctx.config.value.libraries.length, 0)
  assert.equal(persisted, false)
  pending.resolve('C:/new/library')
  await work
  assert.equal(ctx.config.value.libraries[0].path, 'C:/new/library')
  assert.equal(persisted, true)
  assert.equal(ctx.newLib.path, '')
})
test('creation or persistence failures preserve the input and do not register a phantom library', async () => {
  for (const failingStep of ['prepare', 'persist']) {
    const ctx = creation(
      async () => { if (failingStep === 'prepare') throw Error('denied'); return 'C:/new/library' },
      async () => { if (failingStep === 'persist') throw Error('disk full') },
    )
    await ctx.add()
    assert.equal(ctx.config.value.libraries.length, 0)
    assert.equal(ctx.store.libraries.length, 0)
    assert.equal(ctx.newLib.path, 'C:/new/library')
    assert.ok(ctx.libraryAddError.value)
    assert.equal(ctx.libraryAdding.value, false)
  }
})
test('repeated clicks cannot create two copies while preparation is pending', async () => {
  const pending = deferred()
  let calls = 0
  const ctx = creation(() => { calls++; return pending.promise })
  const first = ctx.add()
  await ctx.add()
  assert.equal(calls, 1)
  pending.resolve('C:/new/library')
  await first
  assert.equal(ctx.config.value.libraries.length, 1)
})

test('global error notice leaves the workspace intact, renders errors as text, and can be dismissed', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.events = {}; this.textContent = '' }
    setAttribute() {}
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child) } }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this) }
    addEventListener(name, fn) { this.events[name] = fn }
    set innerHTML(_) { throw Error('Error details must not be interpreted as HTML') }
  }
  const body = new Element('body'), workspace = new Element('main')
  workspace.id = 'app'
  body.append(workspace)
  const context = vm.createContext({ document: { body, createElement: tag => new Element(tag), getElementById: id => body.children.find(child => child.id === id) } })
  const noticeSource = fs.readFileSync('src/services/runtimeErrorNotice.ts', 'utf8').replace('export function', 'function')
  vm.runInContext(compile(noticeSource), context)
  let managed = false
  context.showRuntimeErrorNotice('<img src=x onerror=alert(1)>', () => { managed = true })
  const notice = body.children[1]
  assert.equal(body.children[0], workspace)
  assert.equal(notice.children[2].children[1].textContent, '<img src=x onerror=alert(1)>')
  notice.children[3].children[1].events.click()
  assert.equal(body.children.length, 1)
  context.showRuntimeErrorNotice('again', () => { managed = true })
  context.showRuntimeErrorNotice('latest', () => { managed = true })
  assert.equal(body.children.length, 2)
  body.children[1].children[3].children[0].events.click()
  assert.equal(managed, true)
  assert.equal(body.children.length, 1)
})
