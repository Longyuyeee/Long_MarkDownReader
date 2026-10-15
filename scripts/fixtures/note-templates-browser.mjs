import './workflow-redesign-browser.mjs'
import { renderNoteTemplate } from '/src/config/noteTemplates.ts'
const audit = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke
const listeners = new Map()
let sequence = 1
window.__TAURI_INTERNALS__.transformCallback = callback => { const id = sequence++; listeners.set(id, callback); return id }
audit.confirmReplace = true
audit.disk.set(audit.store.libraryPath + '/项目方案.md', '# 项目方案\n\n未保存的会议结构。')
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if (command === 'plugin:event|listen') { listeners.set(args.event, listeners.get(args.handler)); return sequence++ }
  if (command === 'plugin:event|emit') { listeners.get(args.event)?.({ event: args.event, payload: args.payload }); return }
  if (command === 'plugin:dialog|confirm') return audit.confirmReplace
  if (command === 'get_file_stats') return { created: 1, modified: 1, size: 100 }
  if (command === 'create_format_file' || command === 'create_note_from_template') {
    audit.calls.push({ command, args })
    const base = args.name || args.prefix || '未命名'
    let count = 0, title, path
    do { title = base + (count ? ' ' + count : ''); path = args.targetDir + '/' + title + '.md'; count++ } while (audit.disk.has(path))
    const content = command === 'create_note_from_template' ? renderNoteTemplate(args.content, title) : args.content || ''
    audit.disk.set(path, content); return path
  }
  return original(command, args)
}
audit.announceTemplates = payload => listeners.get('note-templates-changed')?.({ event: 'note-templates-changed', payload })
