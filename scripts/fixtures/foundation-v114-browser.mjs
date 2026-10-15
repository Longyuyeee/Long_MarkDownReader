import './foundation-v113-browser.mjs'
const audit = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke, root = audit.store.libraryPath
audit.importPath = 'C:/exports/笔记模板.json'; audit.exportPath = 'C:/exports/导出模板.json'
audit.importBundle = { kind: 'longedit-note-templates', schemaVersion: 1, templates: [{ name: '沟通记录', content: '# {{title}}\n{{date}}\n' }, { name: '沟通记录', content: '第二份结构' }, { name: '周报', content: '自定义周报结构' }] }
const tail = '\n' + Array.from({ length: 100 }, (_, index) => `\n补充资料 ${index}：其他内容保持原样，继续在原来的位置阅读。\n`).join('')
audit.history = [[10, '# 项目方案\n\n历史第一段\n\n保留的中间段\n\n历史第二段\n' + tail]]
audit.disk.set(root + '/项目方案.md', '# 项目方案\n\n当前第一段\n\n保留的中间段\n\n当前第二段\n' + tail)
audit.store.tabs[0].content = audit.disk.get(root + '/项目方案.md')
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if (command === 'plugin:dialog|open') return audit.importPath
  if (command === 'plugin:dialog|save') return audit.exportPath
  if (command === 'read_note_template_bundle') { if (audit.failRead) throw Error('无法读取模板文件'); return structuredClone(audit.importBundle) }
  if (command === 'export_note_template_bundle') { if (audit.failExport) throw Error('模板文件无法写入'); audit.exported = structuredClone(args); return }
  if (command === 'prepare_history_restore' && audit.failProtection) throw Error('草稿保护写入失败')
  return original(command, args)
}
