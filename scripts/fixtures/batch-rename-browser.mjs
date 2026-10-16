import './file-management-browser.mjs'
const a = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if (command === 'preview_library_renames') {
    const r = args.rule
    return args.paths.map((path, index) => {
      const name = path.split('/').pop(), ext = name.endsWith('.table.json') ? '.table.json' : name.slice(name.lastIndexOf('.')), stem = name.slice(0, -ext.length)
      const next = (r.mode === 'text' ? r.prefix + stem + r.suffix : r.mode === 'replace' ? stem.replaceAll(r.find, r.replacement) : r.position === 'prefix' ? String(r.start + index).padStart(r.digits, '0') + '-' + stem : stem + '-' + String(r.start + index).padStart(r.digits, '0')) + ext
      const message = /[?*<>|]/.test(next) ? '名称包含 Windows 不允许的字符' : next !== name && a.disk.has(path.slice(0, path.lastIndexOf('/') + 1) + next) ? '已有同名项目，请调整名称或移开同名项' : ''
      return { path, newName: next, status: message ? 'error' : next === name ? 'unchanged' : 'ready', message }
    })
  }
  if (command === 'rename_library_items') {
    a.calls.push({ command, args }); const result = { items: [], errors: [] }
    for (const item of args.items) {
      if (a.renameFailure && item.path.endsWith('/会议记录.md')) { result.errors.push({ path: item.path, message: '文件暂时被占用', disposition: 'notExecuted' }); continue }
      const next = item.path.slice(0, item.path.lastIndexOf('/') + 1) + item.newName
      a.disk.set(next, a.disk.get(item.path)); a.disk.delete(item.path); result.items.push({ oldPath: item.path, newPath: next })
    }
    return result
  }
  return original(command, args)
}
