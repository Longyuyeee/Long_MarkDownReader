// Actual App/LibraryMode/dialogs; isolated native-response scenarios, not disk evidence.
import './batch-rename-browser.mjs'
const audit = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke
audit.outcomeScenario = ''
audit.outcomeStep = 0
audit.outcomeRequests = []
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if (command === 'plugin:dialog|open' && audit.outcomeChooseFailure) throw Error('隔离文件夹选择器不可用')
  if (['transfer_library_items', 'undo_library_moves', 'rename_library_items'].includes(command)) audit.outcomeRequests.push({ command, args: JSON.parse(JSON.stringify(args)) })
  if (audit.outcomeScenario === command) {
    ++audit.outcomeStep
    if (audit.outcomeTransportFailure) {
      // The operation may have committed even though the reply is lost.
      await original(command, args)
      throw Error('连接中断，无法确认磁盘操作是否完成')
    }
    if (audit.outcomeLegacyFailure) {
      const item = (args.paths || args.items)[0]
      return { items: [], errors: [{ path: typeof item === 'string' ? item : item.path || item.newPath, message: '未携带执行状态的旧式错误' }] }
    }
    if (audit.outcomeStep === 1) {
      const entries = args.paths || args.items
      const path = item => typeof item === 'string' ? item : item.path || item.newPath
      const first = entries.find(item => path(item).endsWith('/项目方案.md'))
      const retry = entries.find(item => path(item).endsWith('/会议记录.md'))
      const review = entries.find(item => path(item).endsWith('/Inbox'))
      const key = args.paths ? 'paths' : 'items'
      const result = await original(command, { ...args, [key]: [first] })
      result.errors.push({ path: path(retry), message: '目标暂时不可写，文件和历史未变化。', disposition: 'notExecuted' })
      result.errors.push({ path: path(review), message: '文件位置与历史状态需要核对；已保留记录。', disposition: 'needsReview', recoveryId: '.move-stage-isolated-review' })
      return result
    }
  }
  return original(command, args)
}
