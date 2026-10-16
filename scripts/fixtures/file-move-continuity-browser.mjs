import './file-move-event-bootstrap.mjs'
import './file-management-browser.mjs'
const a = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke, root = a.store.libraryPath
const { callbacks, listeners } = window.moveFixtureEvents
const replies = new Map(), releases = new Map(), receipts = new Map()
let requestSequence = 0
a.emitNative = (event, payload) => { for (const id of listeners.get(event) || []) callbacks.get(id)?.({ event, id, payload }) }
a.disk.set(root + '/项目方案.md', '# 项目方案\n\n[会议](会议记录.md)\n')
a.store.tabs.find(tab => tab.path.endsWith('/项目方案.md')).content = a.disk.get(root + '/项目方案.md')
a.store.motionSpeed = 'calm'
a.protectionReplies = []; a.recoveryRequests = []
const protect = async paths => {
  const requestId = 'move-' + ++requestSequence
  const reply = new Promise(resolve => replies.set(requestId, resolve))
  receipts.set(requestId, { active: true, notice: null }); a.emitNative('file-move-protect', { requestId, libraryRoot: root, paths })
  const result = await reply
  return { requestId, result }
}
const release = async (requestId, notice) => {
  const finished = new Promise(resolve => releases.set(requestId, resolve)); receipts.set(requestId, { active: false, notice })
  if (!a.loseReleaseEvent) a.emitNative('file-move-release', { requestId, notice })
  await finished
}
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if (command === 'plugin:event|listen') { const rows = listeners.get(args.event) || []; rows.push(args.handler); listeners.set(args.event, rows); return args.handler }
  if (command === 'reply_file_move_protection') { a.protectionReplies.push(structuredClone(args)); replies.get(args.requestId)?.(args); return }
  if (command === 'acknowledge_file_move_release') { releases.get(args.requestId)?.(); return }
  if (command === 'file_move_protection_status') return receipts.get(args.requestId) || { active: false, notice: null }
  if (command === 'transfer_library_items' && args.operation === 'move') {
    const items = [], errors = []
    for (const path of args.paths) {
      const directory = /^[a-z]:/i.test(args.targetDir) ? args.targetDir : root + '/' + args.targetDir
      const newPath = directory + '/' + path.split('/').pop(), referencing = root + '/项目方案.md'
      const { requestId, result } = await protect([path, newPath, referencing])
      if (!result.ready || result.dirtyPaths.length) {
        a.emitNative('file-move-release', { requestId, notice: null }); receipts.set(requestId, { active: false, notice: null })
        errors.push({ path, message: '请先保存以下文档的修改，再移动或改名：' + result.dirtyPaths.join('、'), disposition: 'notExecuted' }); continue
      }
      a.disk.set(newPath, a.disk.get(path)); a.disk.delete(path)
      a.disk.set(referencing, a.disk.get(referencing).replace('(会议记录.md)', '(Inbox/会议记录.md)'))
      items.push({ oldPath: path, newPath })
      await release(requestId, { root, oldPath: path, newPath, documents: [referencing] })
    }
    return { items, errors }
  }
  if (command === 'list_library_move_recoveries') return [{ id: 'links-fixture', oldPath: root + '/旧文件.md', newPath: root + '/Inbox/旧文件.md' }]
  if (command === 'review_library_move') return { oldPath: root + '/旧文件.md', newPath: root + '/Inbox/旧文件.md', summary: '文件位于新位置，可按当前位置完成引用与历史核对，也可还原本次移动。', canFinish: true, canRestore: true, canExport: true }
  if (command === 'plugin:dialog|open') return root + '/copies'
  if (command === 'export_library_move_originals') { a.recoveryExport = structuredClone(args); return root + '/copies/移动前原文-1' }
  if (command === 'resolve_library_move') { a.recoveryRequests.push(structuredClone(args)); if (a.failRecovery) throw Error('文档在核对后有新修改，请保留原文件'); return }
  return original(command, args)
}
