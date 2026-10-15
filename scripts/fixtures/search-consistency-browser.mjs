import './file-management-browser.mjs'
const audit = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke, root = audit.store.libraryPath
audit.store.motionSpeed = 'calm'; audit.searchCalls = []; audit.slow = []
audit.holdConfigSave = false; audit.configSaves = []
audit.store.libraries.push({ name: '学习资料库', path: 'C:/study-fixture' })
audit.disk.set(root + '/项目预算.txt', '项目预算确认'); audit.disk.set(root + '/预算配置.json', '{"项目":"预算确认"}')
audit.disk.set('C:/study-fixture/跨库笔记.md', '# 跨库笔记\n\n保留原项目资料。')
const hit = (title, path, objectType, context) => ({ title, path, objectType, context, matchKind: 'body', score: 60, extractionFailed: false })
const hits = [hit('项目预算.txt', root + '/项目预算.txt', 'plain-text', '项目预算确认'), hit('预算配置.json', root + '/预算配置.json', 'json', '项目预算参数')]
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if (command === 'save_config' && audit.holdConfigSave) return new Promise((resolve, reject) => audit.configSaves.push(async () => { try { resolve(await original(command, args)) } catch (cause) { reject(cause) } }))
  if (command === 'search_knowledge_libraries' || command === 'search_knowledge') {
    audit.searchCalls.push({ command, args })
    if (args.query === '错误') throw Error('模拟资料库不可读，请检查路径后重试')
    let results = args.query === '空结果' ? [] : args.query === '跨库' ? [hit('跨库笔记.md', 'C:/study-fixture/跨库笔记.md', 'markdown', '跨库正文')] : hits
    if (args.query === '很多') results = Array.from({ length: 32 }, (_, index) => hit(`项目资料${index + 1}.txt`, root + `/项目资料${index + 1}.txt`, 'plain-text', '预算资料'))
    if (args.query === '慢') return new Promise(resolve => audit.slow.push(() => resolve(command === 'search_knowledge' ? [hit('过期结果.md', root + '/过期结果.md', 'markdown', '过期')] : { results: [hit('过期结果.md', root + '/过期结果.md', 'markdown', '过期')], warnings: [], limitReached: false })))
    if (args.libraryRoot) results = results.filter(result => result.path.startsWith(args.libraryRoot + '/'))
    return command === 'search_knowledge' ? results : { results, warnings: args.query === '部分' ? ['离线资料库暂时无法读取'] : [], limitReached: args.query === '部分' }
  }
  return original(command, args)
}
