import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(`Navigation liveness rejected: ${message}`)
  process.exit(1)
}
const requireToken = (source, token, label) => {
  if (!source.includes(token)) fail(`${label} is missing ${token}`)
}

const app = read('src/App.vue')
const main = read('src/main.ts')
const runtime = read('src/services/tauriRuntime.ts')
const store = read('src/store/app.ts')
const library = read('src/views/LibraryMode.vue')
const runtimeEvidence = JSON.parse(read('docs/evidence/ux40-navigation-liveness/runtime-summary.json'))

if (app.includes('page-loader') || app.includes('routeLoading') || app.includes('mode="out-in"')) fail('blocking route UI remains in App.vue')
for (const token of ['router.onError', 'routeErrorMessage', '重新载入界面', 'getCurrentWindow', "invoke<string>('open_external_file_window'", "appWindow.label === 'main'"]) requireToken(app, token, 'App recovery')
for (const token of ['OperationTimeoutError', 'withTimeout', 'invokeWithTimeout']) requireToken(runtime, token, 'Tauri timeout boundary')
for (const token of ["invokeWithTimeout<any>('get_config'", "invokeWithTimeout<boolean>('get_ai_credential_status'", "withTimeout(isEnabled()", 'this.restoreTabsState()']) requireToken(store, token, 'configuration recovery')
for (const token of ['app.mount(\'#app\')', 'await store.loadConfig()', "withTimeout(router.isReady(), 8000", '[Long编辑 Bootstrap Recovery]']) requireToken(main, token, 'bootstrap recovery')
if (main.indexOf("app.mount('#app')") > main.indexOf('await store.loadConfig()')) fail('application shell mounts after configuration IPC')
for (const token of ['let editorLoadGeneration = 0', 'const generation = ++editorLoadGeneration', 'const isCurrentRequest = () =>', 'if (!isCurrentRequest()) return', 'editorLoadGeneration += 1']) requireToken(library, token, 'shared text editor race guard')
if (runtimeEvidence.stage !== 'UX-40' || runtimeEvidence.status !== 'debug-tauri-runtime-passed' || !/^[0-9a-f]{40}$/.test(runtimeEvidence.sourceCommit)) fail('desktop runtime evidence identity drift')
if (runtimeEvidence.formatTabs !== 12 || runtimeEvidence.checks?.runtimeErrorCount !== 0 || runtimeEvidence.checks?.blockingOverlayObserved !== false || runtimeEvidence.checks?.blockingErrorSurfaceObserved !== false) fail('desktop runtime navigation evidence regressed')
for (const key of ['wheelScrollChanged', 'shiftWheelScrollChanged', 'arrowScrollChanged', 'keyboardNavigationChanged', 'activeTabRevealed', 'narrowViewportStable', 'sourceFilesUnchanged']) {
  if (runtimeEvidence.checks?.[key] !== true) fail(`desktop runtime check failed: ${key}`)
}
if (runtimeEvidence.sourceUserContentIncluded !== false || runtimeEvidence.releaseCandidate !== false) fail('desktop runtime evidence boundary drift')

console.log('Navigation liveness passed: shell, IPC, route recovery, stale-load protection, and 12-format Tauri switching are aligned.')
