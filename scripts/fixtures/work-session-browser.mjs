import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import * as naive from 'naive-ui'
import WorkspaceHome from '/src/views/WorkspaceHome.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
window.sessionAudit = { calls: [] }
window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
  window.sessionAudit.calls.push({ command, args })
  if (command === 'get_workspace_overview') return { totalFiles: 2, tasks: [], completedTasks: [], recentFiles: [], canvases: [], formatCounts: [] }
  if (command === 'get_knowledge_index_status') return { state: 'ready', sourceCount: 2, objectCount: 2, relationCount: 0, progress: 100, cacheBytes: 0, recoveryAvailable: false }
  if (command === 'summarize_graph_relations') return []
  if (command === 'analyze_graph_health') return { brokenLinks: [], ambiguousLinks: [], orphanNotes: [], scannedNotes: 2 }
  if (command === 'analyze_workspace_health') return { duplicateGroups: [], unreferencedAnnotations: [], scannedFiles: 2, hashedFiles: 2, scannedAnnotations: 0, truncated: false }
  throw Error(`Unexpected IPC ${command}`)
} }
const pinia = createPinia(), store = useAppStore(pinia)
store.activeLibraryPath = 'C:/audit'; store.libraries = [{ path: 'C:/audit', name: '项目资料库' }]
store.tabs = [{ id: 'C:/audit/方案.md', path: 'C:/audit/方案.md', title: '方案.md', content: '用户尚未保存的原稿', isDirty: true }]
store.activeTabId = store.tabs[0].id; store.loadConfig = async () => {}
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', name: 'Workspace', component: WorkspaceHome }, { path: '/library', name: 'LibraryMode', component: { render: () => null } }] })
await router.push('/')
window.sessionAudit.store = store; window.sessionAudit.router = router
const app = createApp({ render: () => h(naive.NConfigProvider, {}, { default: () => h(naive.NDialogProvider, {}, { default: () => h(naive.NMessageProvider, {}, { default: () => h(WorkspaceHome) }) }) }) })
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts')
registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app')
document.body.style.margin = '0'; document.body.style.fontFamily = 'Segoe UI, Microsoft YaHei, sans-serif'; document.body.dataset.theme = 'white'
document.querySelector('#app').style.height = '100vh'
