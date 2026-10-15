import './file-management-browser.mjs'
const audit = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke
audit.importFails = true; audit.importRefreshFails = false; audit.listeners = []; audit.callbacks = new Map()
audit.store.motionSpeed = 'calm'
let nextCallback = 100
window.__TAURI_INTERNALS__.transformCallback = callback => { const id = nextCallback++; audit.callbacks.set(id, callback); return id }
audit.nativeEvent = (event, payload) => { for (const listener of audit.listeners.filter(item => item.event === event)) audit.callbacks.get(listener.handler)?.({ event, id: listener.id, payload }) }
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if (command === 'plugin:event|listen') { const id = audit.listeners.length + 1; audit.listeners.push({ ...args, id }); return id }
  if (command === 'import_library_files') {
    audit.calls.push({ command, args }); const result = { items: [], errors: [] }
    for (const source of args.sourcePaths) {
      if (audit.importFails && source.endsWith('项目方案.md')) { result.errors.push({ path: source, message: '本地图片不存在：images/流程.png；未覆盖原文件' }); continue }
      const name = source.split('/').pop(), next = args.targetDir + '/' + name.replace('.md', ' - 副本.md')
      if (audit.disk.has(next)) throw Error('test refuses accidental successful-item retry')
      audit.disk.set(next, '# 导入的副本'); result.items.push({ oldPath: source, newPath: next })
    }
    return result
  }
  if (command === 'save_folder_order' && audit.importRefreshFails) throw Error('模拟目录顺序暂时不可保存')
  if (command === 'save_folder_order') { audit.calls.push({ command, args }); return }
  return original(command, args)
}
