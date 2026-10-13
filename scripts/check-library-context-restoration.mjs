import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) {
    if (!source.includes(token)) fail(`${label} token missing: ${token}`)
  }
}

const store = read('src/store/app.ts')
requireTokens(store, 'Configuration readiness', [
  'let configLoadPromise: Promise<void> | null = null',
  'configReady: false',
  'if (this.configReady) return',
  'if (configLoadPromise) return configLoadPromise',
  'this.configReady = true',
])

const main = read('src/main.ts')
requireTokens(main, 'Non-blocking bootstrap and managed route restoration', [
  'app.use(router)',
  "app.mount('#app')",
  'await store.loadConfig()',
  "withTimeout(router.isReady(), 8000, 'router:isReady')",
  'managedFileLocation(store.activeTabId',
  'router.replace(',
  '[Long编辑 Bootstrap Recovery]',
])
if (main.indexOf("app.mount('#app')") > main.indexOf('await store.loadConfig()')) {
  fail('Application shell must mount before configuration IPC so restoration cannot block navigation.')
}
requireTokens(store, 'Bounded configuration recovery', [
  "invokeWithTimeout<any>('get_config', undefined, 4000)",
  'this.restoreTabsState()',
])

const app = read('src/App.vue')
requireTokens(app, 'Library navigation guard', [
  "to.name === 'LibraryMode'",
  "typeof to.query.path !== 'string'",
  'path: store.activeTabId',
])

const graph = read('src/components/GraphView.vue')
requireTokens(graph, 'Graph return context', [
  'returnToLibrary',
  'managedFileLocation(store.activeTabId)',
])
requireTokens(read('src/components/AppNavigation.vue'), 'Global library tab', [
  "{ name: 'LibraryMode', label: '资料库'", ':to="{ name: item.name }"',
])

const library = read('src/views/LibraryMode.vue')
requireTokens(library, 'Library active tab restoration', [
  'await store.loadConfig()',
  'route.query.path !== activeTabId.value',
  'path: activeTabId.value',
])

for (const [path, label, pathToken] of [
  ['src/views/TableView.vue', 'Table editor', "route.query.path || store.activeTabId || ''"],
  ['src/views/WorkbookView.vue', 'Workbook editor', "route.query.path || store.activeTabId || ''"],
]) {
  const source = read(path)
  requireTokens(source, label, [
    pathToken,
    'await store.loadConfig()',
    'recallWorkspaceViewState(',
    'rememberWorkspaceViewState(',
    'onBeforeRouteLeave(',
  ])
}

const viewState = read('src/services/workspaceViewState.ts')
requireTokens(viewState, 'Bounded workspace view metadata', [
  'const MAX_ENTRIES = 24',
  'const states = new Map<string, WorkspaceViewState>()',
  'const safeView = (state: WorkspaceViewState): WorkspaceViewState =>',
  'saved[path] = safeView(state)',
  'Object.entries(saved).slice(-MAX_ENTRIES)',
  'rememberWorkspaceViewState',
  'recallWorkspaceViewState',
])
// F2 restores reading positions after restart. Verify the persisted metadata
// excludes document/draft contents instead of prohibiting persistence entirely.
const contextTests = spawnSync(process.execPath, ['--test', 'scripts/test-work-session-context.mjs'], { encoding: 'utf8' })
if (contextTests.status !== 0) {
  fail(contextTests.error?.message || contextTests.stdout + contextTests.stderr)
}

console.log('Library configuration, graph return, active file, and bounded restart context restoration contract passed (3 behavioral checks).')
