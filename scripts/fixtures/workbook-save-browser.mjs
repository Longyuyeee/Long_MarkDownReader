import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory, RouterView } from 'vue-router'
import { NConfigProvider, NDialogProvider, NMessageProvider, NIcon, NDropdown, NModal } from 'naive-ui'
import WorkbookView from '/src/views/WorkbookView.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const document = { path: 'tasks.xlsx', size: 100, signature: 'initial', sheets: ['Sheet1', 'Sheet2'], definedNames: [], protection: {}, linkedData: { pivotTables: [], slicers: [], externalLinks: [], connections: [], externalRelationshipCount: 0, summary: {}, policy: {} } }
const sheet = { sheet: 'Sheet1', rowOffset: 0, totalRows: 1, totalColumns: 1, returnedColumns: 1, rows: [[{ value: '确认交付日期', formattedValue: '确认交付日期', kind: 'string' }]], truncatedColumns: false, defaultRowHeight: 15, defaultColumnWidth: 20, freezePane: {}, autoFilterState: { columns: [], sortConditions: [] }, pageLayout: { margins: {}, setup: {}, options: {}, headerFooter: {}, protection: { enabled: false, blockedActions: [] } } }
for (const key of ['rowHeights','columnWidths','rowStates','columnStates','mergedCells','namedStyles','tables','dataValidations','conditionalFormats','arrayFormulas','drawings']) sheet[key] = []
const secondSheet = structuredClone(sheet)
secondSheet.sheet = 'Sheet2'
secondSheet.rows[0][0] = { value: '第二张表的客户清单', formattedValue: '第二张表的客户清单', kind: 'string' }
const sheets = { Sheet1: sheet, Sheet2: secondSheet }
if (new URLSearchParams(window.location.search).has('filter')) {
  sheet.autoFilter = { top: 0, bottom: 1, left: 0, right: 0 }
  sheet.autoFilterState = { editable: true, columns: [], sortConditions: [] }
  sheet.rows.push([{ value: '客户交付', formattedValue: '客户交付', kind: 'string' }]); sheet.totalRows = 2
}
const audit = window.workbookAudit = { pending: null, failNext: false, holdReads: false, readQueue: [], validationWrites: [] }
window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
  if (command === 'update_workbook_filter') {
    const change = structuredClone(args.payload.change)
    await new Promise((resolve, reject) => {
      audit.pendingFilter = fail => { audit.pendingFilter = null; fail ? reject(new Error('模拟筛选写入失败')) : resolve() }
    })
    sheets[change.sheet].autoFilterState = { editable: true, columns: [], sortConditions: [], ...(change.action === 'apply' ? change : {}) }
    document.signature += '-filter'; return structuredClone(document)
  }
  if (command === 'update_workbook_outline') {
    const payload = structuredClone(args.payload)
    await new Promise((resolve, reject) => {
      audit.pendingOutline = fail => { audit.pendingOutline = null; fail ? reject(new Error('模拟分组写入失败')) : resolve() }
    })
    for (const [key, edits] of [['rowStates', payload.rowEdits], ['columnStates', payload.columnEdits]]) {
      for (const edit of edits) {
        const states = sheets[edit.sheet][key]
        const index = states.findIndex(state => key === 'rowStates' ? state.row === edit.row : state.startColumn === edit.startColumn)
        if (index < 0) states.push(edit); else states[index] = edit
      }
    }
    document.signature += '-outline'
    return structuredClone(document)
  }
  if (command === 'update_workbook_structure') {
    const change = structuredClone(args.payload.change)
    if (change.axis !== 'row') throw Error('This fixture supports row operations only')
    await new Promise((resolve, reject) => {
      audit.pendingStructure = fail => { audit.pendingStructure = null; fail ? reject(new Error('模拟结构写入失败')) : resolve() }
    })
    const target = sheets[change.sheet]
    if (change.action === 'insert') target.rows.splice(change.index, 0, ...Array.from({ length: change.count }, () => [{ value: '', kind: 'string' }]))
    else target.rows.splice(change.index, change.count)
    target.totalRows = target.rows.length
    document.signature += '-structure'
    return structuredClone(document)
  }
  if (['update_workbook_page_layout', 'update_workbook_print_options', 'update_workbook_header_footer'].includes(command)) {
    const change = structuredClone(args.payload.change)
    await new Promise((resolve, reject) => {
      audit.pendingPageSetting = fail => { audit.pendingPageSetting = null; fail ? reject(new Error('模拟页面设置写入失败')) : resolve() }
    })
    const layout = sheets[change.sheet].pageLayout
    if (command === 'update_workbook_page_layout') {
      layout.setup = { ...change }; layout.margins = change.margins; layout.printArea = change.printArea
    } else if (command === 'update_workbook_print_options') layout.options = { ...change }
    else layout.headerFooter = { ...change }
    document.signature += '-page-setting'
    return structuredClone(document)
  }
  if (command === 'update_workbook_freeze_pane') {
    await new Promise((resolve, reject) => {
      audit.pendingFreeze = fail => { audit.pendingFreeze = null; fail ? reject(new Error('模拟冻结写入失败')) : resolve() }
    })
    sheets[args.sheet].freezePane = { rows: args.rows, columns: args.columns }
    document.signature += '-freeze'
    return structuredClone(document)
  }
  if (command === 'update_workbook_data_validation') {
    if (audit.holdValidation) await new Promise((resolve, reject) => {
      audit.pendingValidation = fail => { audit.pendingValidation = null; fail ? reject(new Error('模拟规则写入失败')) : resolve() }
    })
    const change = structuredClone(args.payload.change)
    audit.validationWrites.push(change)
    const rules = sheets[change.sheet].dataValidations
    if (change.action === 'create') rules.push(change.validation)
    else if (change.action === 'delete') rules.splice(change.validationIndex, 1)
    else if (change.action === 'update') rules[change.validationIndex] = change.validation
    else throw Error(`Unexpected validation action ${change.action}`)
    document.signature += '-validation'
    return structuredClone(document)
  }
  if (command === 'read_workbook_file') return structuredClone(document)
  if (command === 'read_workbook_sheet') {
    const snapshot = structuredClone(sheets[args.sheet])
    if (audit.holdReads) return new Promise((resolve, reject) => {
      audit.readQueue.push({ resolve: () => resolve(snapshot), reject: () => reject('过期读取失败') })
    })
    return snapshot
  }
  if (command === 'write_workbook_draft') return new Promise((resolve, reject) => {
    audit.pending = () => {
      audit.pending = null
      if (audit.failNext) { audit.failNext = false; reject('模拟磁盘失败'); return }
      for (const edit of args.payload.edits) sheets[edit.sheet].rows[edit.row][edit.column] = { value: edit.input, formattedValue: edit.input, kind: edit.kind }
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
