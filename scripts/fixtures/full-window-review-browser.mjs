import { createApp, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '/src/App.vue'
import packageInfo from '/package.json'
import productionRouter from '/src/router/index.ts'
import { registerNaiveComponents } from '/src/services/naiveComponents.ts'
import { opensInLibraryShell, findFileFormat } from '/src/config/fileFormats.ts'
import { installAppTooltipPolicy } from '/src/services/appTooltipPolicy.ts'
import { installHorizontalWheelNavigation } from '/src/services/horizontalWheel.ts'
import { installContextMenuPolicy } from '/src/services/contextMenuPolicy.ts'
import { showRuntimeErrorNotice } from '/src/services/runtimeErrorNotice.ts'
import '/src/styles/motion.scss'
import '/src/styles/workflow-surfaces.scss'
import '/src/styles/display-preferences.scss'
import '/src/styles/vditor-content-themes.scss'
import 'vfonts/Inter.css'
import 'vfonts/FiraCode.css'

// Reuse format fixture data, then mount the actual application and production
// routes. Only the IPC boundary is simulated; no replacement layout is drawn.
const params = new URLSearchParams(location.search)
const fixture = params.get('fixture') || 'library-shell'
if (!/^[a-z0-9-]+$/.test(fixture)) throw Error('Unknown fixture')
window.__TAURI_EVENT_PLUGIN_INTERNALS__ ||= { unregisterListener() {} }
await import(/* @vite-ignore */ `./${fixture}-browser.mjs`)
await nextTick(); await new Promise(done => setTimeout(done, 100))
const previous = document.querySelector('#app').__vue_app__
const pinia = previous.config.globalProperties.$pinia
const oldRoute = previous.config.globalProperties.$router?.currentRoute.value
const store = pinia._s.get('app')
const sourcePath = String(oldRoute?.query.path || store.activeTabId || '')
const oldFullPath = oldRoute?.fullPath || '/workspace'
previous.unmount()
// The seed component may have initialized the shared updater using its old
// fixture version. This whole-window fixture represents the current build.
const { updaterState } = await import('/src/services/appUpdater.ts')
updaterState.currentVersion = packageInfo.version
document.querySelector('#app').style.cssText = 'height:100vh;width:100%'
const root = /^[a-z]:[\\/]/i.test(store.libraryPath) ? store.libraryPath.replaceAll('\\', '/') : 'C:/window-review'
const path = sourcePath && !/^[a-z]:[\\/]/i.test(sourcePath) ? `${root}/${sourcePath.split(/[\\/]/).pop()}` : sourcePath
store.activeLibraryPath = root
if (!store.libraries.some(item => item.path === root)) store.libraries = [{ name: '项目与交付资料库', path: root }]
store.configReady = true; store.loadConfig = async () => {}; store.isZen = false
store.theme = 'white'; store.visualStyle = 'minimal'; store.motionSpeed = 'calm'
const textPath = path.endsWith('.md') ? path : `${root}/项目方案.md`
const markdown = '# 项目方案\n\n记录想法，整理资料，继续工作。\n\n## 本周安排\n\n- [ ] 核对界面与内容\n\n保留用户正在编辑的内容。\n'
const sideFiles = [path, `${root}/会议记录.md`, `${root}/项目计划与交付安排.md`].filter(Boolean)
const trace = window.fullWindowAudit = { calls: [], errors: [], store, sourcePath: path, ready: false, failDirectory: false }
const originalInvoke = window.__TAURI_INTERNALS__.invoke
window.__TAURI_EVENT_PLUGIN_INTERNALS__ ||= { unregisterListener() {} }
window.__TAURI_INTERNALS__.metadata = { currentWindow: { label: params.get('surface') === 'external' || fixture === 'quick-note-direct' ? 'external-review' : 'main' }, currentWebview: { label: 'main' } }
window.__TAURI_INTERNALS__.transformCallback ||= () => 1
const fallback = (command, args) => {
  if (command === 'scan_directory') return [...sideFiles.map(file => ({ name: file.split('/').pop(), path: file, is_dir: false })), { name: '参考资料', path: `${root}/参考资料`, is_dir: true }].filter(file => file.path.slice(0, file.path.lastIndexOf('/')) === args.path)
  if (command === 'get_history_metadata') return {}
  if (command === 'list_file_relations') return []
  if (command === 'get_folder_order') return { items: [], pinned: [] }
  if (command === 'get_library_stats') return { file_count: sideFiles.length, total_words: 560 }
  if (command === 'get_knowledge_index_status') return { state: 'ready', schemaVersion: 1, sourceCount: sideFiles.length, objectCount: sideFiles.length, relationCount: 0, progress: 100, cacheBytes: 0, recoveryAvailable: false }
  if (command === 'get_tag_catalog_page') return { sessionId: 'full-window-tags', tags: [], nextCursor: null, scanState: 'ready', scanComplete: true, examinedNotes: 3, totalNotes: 3, unreadSources: 0, warnings: [] }
  if (command === 'read_text_document') return { path: args.path, content: markdown, encoding: 'utf-8', encodingConfidence: 'high', bom: 'none', lineEnding: 'lf', hasFinalNewline: true, signature: 'review-text', contentDigest: 'review-text', size: markdown.length, modified: 1 }
  if (['get_all_tags', 'discover_external_applications', 'summarize_graph_relations', 'find_backlinks', 'extract_wikilinks', 'list_history'].includes(command)) return []
  throw Error('Missing full-window fixture IPC: ' + command)
}
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  trace.calls.push({ command, args })
  if (command === 'plugin:event|listen') return 1
  if (command.startsWith('plugin:event|') || command.startsWith('plugin:window|') || command === 'save_config' || command === 'report_window_draft_session' || command === 'open_quick_note') return
  if (command === 'plugin:app|version') return packageInfo.version
  if (command === 'register_window_draft_session') return 'full-window-session'
  if (command === 'check_community_update') return { available: false, currentVersion: packageInfo.version, latestVersion: packageInfo.version, releaseNotes: '', releaseUrl: '', publishedAt: null, installerName: '', installerSize: 0, installerSha256: '' }
  if (command === 'read_external_text_document' && fixture === 'temp-redesign') {
    const result = await originalInvoke('read_external_markdown_file', args)
    return { ...fallback('read_text_document', args), ...result }
  }
  if (command === 'scan_directory' && trace.failDirectory) throw Error('路径不存在或不可访问 (os error 2)')
  try { return await originalInvoke(command, args) }
  catch (error) {
    if (!/Unexpected|Unmocked|Missing|测试中不允许真实写入/.test(String(error))) throw error
    return fallback(command, args)
  }
}
const router = createRouter({ history: createMemoryHistory(), routes: productionRouter.options.routes })
const surface = params.get('surface') || 'page'
let target
if (surface === 'embedded' && path && opensInLibraryShell(findFileFormat(path))) {
  store.tabs = [{ id: path, path, title: path.split(/[\\/]/).pop(), content: path.endsWith('.md') ? markdown : '', isDirty: false }, ...sideFiles.filter(file => file !== path).map(file => ({ id: file, path: file, title: file.split('/').pop(), content: markdown, isDirty: false }))]
  store.activeTabId = path; target = { name: 'LibraryMode', query: { path } }
} else if (fixture === 'workflow-redesign') target = { name: params.get('inbox') === '1' ? 'Inbox' : 'WorkspaceHome' }
else if (fixture === 'library-shell') target = { name: 'LibraryMode', query: { path } }
else if (fixture === 'office-handoff') target = { name: params.has('legacy') ? 'LegacyOffice' : 'ExternalOffice', query: { path } }
else if (fixture === 'capabilities-redesign') target = { name: 'ReleaseCapabilities' }
else if (fixture === 'quick-note-direct') target = { name: 'QuickNote' }
else if (fixture === 'odf-redesign') target = { name: 'OdfReader', query: { path } }
else target = oldFullPath
if (surface === 'external' && typeof target !== 'string') target.query = { ...target.query, external: '1' }
if (surface === 'external' && typeof target === 'string') target += `${target.includes('?') ? '&' : '?'}external=1`
const app = createApp(App)
registerNaiveComponents(app); app.use(pinia).use(router)
await router.push(target); await router.isReady()
app.config.errorHandler = error => { trace.errors.push(String(error)); showRuntimeErrorNotice(error, () => router.push({ name: 'Settings' })) }
app.mount('#app')
installAppTooltipPolicy(); installHorizontalWheelNavigation(); installContextMenuPolicy()
trace.router = router
trace.reportError = error => showRuntimeErrorNotice(error, () => router.push({ name: 'Settings' }), () => router.push({ name: 'LibraryMode' }))
await nextTick(); trace.ready = true
