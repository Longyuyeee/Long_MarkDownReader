await import('./workflow-redesign-browser.mjs')
const root = 'C:/workflow-fixture', source = window.workflowAudit
const documents = new Map()
for (const name of ['A.table.json', 'B.table.json', 'C.csv']) {
  const config = { filter: '', sortDirection: 'asc', frozenColumns: 0, columnWidths: [220, 180], cardColumns: [] }
  const path = root + '/' + name
  documents.set(path, { path, format: name.endsWith('.csv') ? 'csv' : 'longedit-table', delimiter: ',', encoding: 'utf-8', hasBom: false, lineEnding: 'lf', signature: name,
    headers: ['事项', '进度'], rows: Array.from({ length: 80 }, (_, i) => [name[0] + '事项' + i, '待处理']), columnTypes: ['text', 'text'], columnIds: ['task', 'status'], rowIds: Array.from({ length: 80 }, (_, i) => 'row-' + i),
    view: config, views: [{ id: 'grid', name: '表格', kind: 'grid', config }], activeView: 'grid' })
  source.disk.set(path, '')
  source.store.tabs.push({ id: path, path, title: name, isDirty: false })
}
const pending = new Map(), original = window.__TAURI_INTERNALS__.invoke
window.tabSwitchAudit = { ...source, documents, pending, hold: false, reads: [], writes: [] }
window.__TAURI_INTERNALS__.invoke = async (command, args) => {
  const audit = window.tabSwitchAudit
  if (command === 'read_table_file') {
    audit.reads.push(args.path)
    if (audit.hold) return new Promise((resolve, reject) => { const requests = pending.get(args.path) || []; requests.push({ resolve: () => resolve(structuredClone(documents.get(args.path))), reject }); pending.set(args.path, requests) })
    return structuredClone(documents.get(args.path))
  }
  if (command === 'write_table_file') { audit.writes.push(args); Object.assign(documents.get(args.path), args.payload); return { signature: 'saved', size: 100 } }
  return original(command, args)
}
await source.router.push({ name: 'LibraryMode', query: { path: root + '/A.table.json' } })
