// Actual production TableView; only native IPC/configuration are simulated.
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory, RouterView } from 'vue-router'
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import TableView from '/src/views/TableView.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const view = { filter: '', sortDirection: 'asc', frozenColumns: 0, columnWidths: [280, 240], cardColumns: [] }
const disk = { path: 'tasks.csv', format: 'csv', delimiter: ',', encoding: 'utf-8', hasBom: false, lineEnding: 'lf', signature: 'initial', headers: ['任务', '备注'], rows: [['确认交付日期', '待处理']], columnTypes: ['text', 'text'], columnIds: ['task', 'note'], rowIds: ['r1'], view, views: [{ id: 'grid', name: '表格', kind: 'grid', config: view }], activeView: 'grid' }
const audit = window.tableAudit = { disk, pending: null, writes: [], failNext: false }
window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
  if (command === 'read_table_file') return structuredClone(audit.disk)
  if (command === 'write_table_file') {
    const payload = structuredClone(args.payload)
    audit.writes.push(payload)
    return new Promise((resolve, reject) => { audit.pending = () => {
      audit.pending = null
      if (audit.failNext) { audit.failNext = false; reject('模拟写入失败'); return }
      Object.assign(audit.disk, payload, { signature: `saved-${audit.writes.length}` })
      resolve({ signature: audit.disk.signature, size: 96 })
    } })
  }
  throw new Error(`Unexpected IPC: ${command}`)
} }
const pinia = createPinia()
const store = useAppStore(pinia)
store.activeLibraryPath = 'isolated'; store.configReady = true
const router = createRouter({ history: createWebHashHistory(), routes: [{ path: '/table', component: TableView }] })
await router.push('/table?path=tasks.csv')
const app = createApp({ render: () => h(NConfigProvider, {}, { default: () => h(NDialogProvider, {}, { default: () => h(NMessageProvider, {}, { default: () => h(RouterView) }) }) }) })
app.use(pinia).use(router).mount('#app')
document.documentElement.dataset.theme = 'white'
document.body.style.margin = '0'
document.getElementById('app').style.height = '100vh'
