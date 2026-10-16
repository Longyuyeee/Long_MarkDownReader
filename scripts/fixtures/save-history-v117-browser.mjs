import './foundation-v114-browser.mjs'
import { EditorView } from '@codemirror/view'
const a = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke
a.updateText = value => { const view = EditorView.findFromDOM(document.querySelector('.cm-editor')); if(!view) throw Error('Missing CodeMirror'); view.dispatch({changes:{from:0,to:view.state.doc.length,insert:value}}) }
a.metadata = {}; a.protectedDrafts = []; a.conflictDelay = 0
a.snapshot = path => ({path,content:a.disk.get(path),encoding:'utf-8',encodingConfidence:'high',bom:'none',lineEnding:'lf',hasFinalNewline:true,signature:a.disk.get(path),contentDigest:a.disk.get(path),size:a.disk.get(path)?.length || 0,modified:1})
window.__TAURI_INTERNALS__.invoke = async (command,args={}) => {
  if (command === 'get_history_metadata') { if (a.failMetadata) throw Error('模拟备注读取失败'); return structuredClone(a.metadata[args.path] || {}) }
  if (command === 'set_history_metadata') { if (a.failMetadataSave) throw Error('模拟备注保存失败'); (a.metadata[args.path] ||= {})[args.timestamp] = {pinned:args.pinned,note:args.note}; return }
  if (command === 'delete_history_version') { a.history = a.history.filter(([time])=>time !== args.timestamp); return }
  if (command === 'list_history' && a.failHistory) throw Error('模拟历史读取失败')
  if (command === 'write_text_document' && a.requireConflict) throw {code:'external-modified',message:'磁盘文件已变化'}
  if (command === 'resolve_text_conflict') {
    a.calls.push({command,args})
    if (a.failConflict) throw Error('草稿保护写入失败')
    if (args.expectedSignature !== a.disk.get(args.path)) throw Error('磁盘内容再次变化，请重新比较')
    if (a.conflictDelay) await new Promise(resolve => {a.resolveConflict = resolve})
    const snapshot = a.snapshot(args.path)
    if (args.action === 'copy') { const copyPath = args.path.replace(/(\.[^.]+)$/,'-当前副本1$1'); a.disk.set(copyPath,args.currentDraft); return {snapshot,copyPath} }
    a.protectedDrafts.push(args.currentDraft)
    a.history.push([Math.floor(Date.now()/1000),args.currentDraft])
    return {snapshot,copyPath:null}
  }
  return original(command,args)
}
