import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory, RouterView } from 'vue-router'
import { NConfigProvider, NDialogProvider, NMessageProvider, NIcon, NDropdown, NModal } from 'naive-ui'
import WorkbookView from '/src/views/WorkbookView.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const document = { path: 'tasks.xlsx', size: 100, signature: 'initial', sheets: ['Sheet1'], definedNames: [], protection: {}, linkedData: { pivotTables: [], slicers: [], externalLinks: [], connections: [], externalRelationshipCount: 0, summary: {}, policy: {} } }
const sheet = { sheet: 'Sheet1', rowOffset: 0, totalRows: 1, totalColumns: 1, returnedColumns: 1, rows: [[{ value: '确认交付日期', formattedValue: '确认交付日期', kind: 'string' }]], truncatedColumns: false, defaultRowHeight: 15, defaultColumnWidth: 20, freezePane: {}, autoFilterState: { columns: [], sortConditions: [] }, pageLayout: { margins: {}, setup: {}, options: {}, headerFooter: {}, protection: { enabled: false, blockedActions: [] } } }
for (const key of ['rowHeights','columnWidths','rowStates','columnStates','mergedCells','namedStyles','tables','dataValidations','conditionalFormats','arrayFormulas','drawings']) sheet[key] = []
const audit = window.workbookAudit = { pending: null, failNext: false }
window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
  if (command === 'read_workbook_file') return structuredClone(document)
  if (command === 'read_workbook_sheet') return structuredClone(sheet)
  if (command === 'write_workbook_draft') return new Promise((resolve, reject) => {
    audit.pending = () => {
      audit.pending = null
      if (audit.failNext) { audit.failNext = false; reject('模拟磁盘失败'); return }
      for (const edit of args.payload.edits) sheet.rows[edit.row][edit.column] = { value: edit.input, formattedValue: edit.input, kind: edit.kind }
      document.signature += '-saved'; resolve(structuredClone(document))
    }
  })
  throw Error(`Unexpected IPC ${command}`)
} }
const pinia = createPinia(), store = useAppStore(pinia)
store.activeLibraryPath = 'isolated'; store.configReady = true
const router = createRouter({ history: createWebHashHistory(), routes: [{ path: '/workbook', component: WorkbookView }, { path: '/library', component: { render: () => h('div', '已离开工作簿') } }] })
await router.push('/workbook?path=tasks.xlsx')
const app = createApp({ render: () => h(NConfigProvider, {}, { default: () => h(NDialogProvider, {}, { default: () => h(NMessageProvider, {}, { default: () => h(RouterView) }) }) }) })
app.use(pinia).use(router).component('NIcon', NIcon).component('NDropdown', NDropdown).component('NModal', NModal).mount('#app')
window.document.body.style.margin = '0'
window.document.body.dataset.theme = 'white'
window.document.getElementById('app').style.height = '100vh'
window.document.querySelector('.n-config-provider').style.height = '100%'
