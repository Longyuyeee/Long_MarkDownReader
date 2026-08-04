import fs from 'node:fs'

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
if (!/const bootstrap = async \(\) => \{[\s\S]*?await store\.loadConfig\(\)[\s\S]*?app\.use\(router\)[\s\S]*?await router\.isReady\(\)[\s\S]*?app\.mount\('#app'\)/.test(main)) {
  fail('Application bootstrap must restore configuration before router components mount.')
}
requireTokens(main, 'Initial managed route restoration', ['managedFileLocation(store.activeTabId', 'router.replace('])

const app = read('src/App.vue')
requireTokens(app, 'Library navigation guard', [
  "to.name === 'LibraryMode'",
  "typeof to.query.path !== 'string'",
  'path: store.activeTabId',
])

const graph = read('src/components/GraphView.vue')
requireTokens(graph, 'Graph return context', [
  '@back="returnToLibrary"',
  '@click="returnToLibrary"',
  'managedFileLocation(store.activeTabId)',
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
requireTokens(viewState, 'Bounded in-memory workspace state', [
  'const MAX_ENTRIES = 24',
  'const states = new Map<string, WorkspaceViewState>()',
  'rememberWorkspaceViewState',
  'recallWorkspaceViewState',
])
if (viewState.includes('localStorage') || viewState.includes('sessionStorage')) {
  fail('Workspace scroll state must remain in memory and must not persist full paths.')
}

console.log('Library configuration, graph return, active file, and workspace view-state restoration contract passed.')
