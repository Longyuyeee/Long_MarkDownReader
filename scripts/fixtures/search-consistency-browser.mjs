import './file-management-browser.mjs'
const audit = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke, root = audit.store.libraryPath
audit.store.motionSpeed = 'calm'; audit.searchCalls = []; audit.slow = []
audit.holdConfigSave = false; audit.configSaves = []
audit.store.libraries.push({ name: '学习资料库', path: 'C:/study-fixture' })
audit.disk.set(root + '/项目预算.txt', '项目预算确认'); audit.disk.set(root + '/预算配置.json', '{"项目":"预算确认"}')
audit.disk.set('C:/study-fixture/跨库笔记.md', '# 跨库笔记\n\n保留原项目资料。')
audit.disk.set('C:/study-fixture/跨库资料.txt', '项目预算另库资料')
audit.slowDirectory = false
audit.canonicalDirectory = false
const hit = (title, path, objectType, context) => ({ title, path, objectType, context, matchKind: 'body', score: 60, extractionFailed: false })
const hits = [hit('项目预算.txt', root + '/项目预算.txt', 'plain-text', '项目预算确认'), hit('预算配置.json', root + '/预算配置.json', 'json', '项目预算参数')]
const nativePath = '\\\\?\\' + (root + '/项目预算.txt').replaceAll('/', '\\')
const pathIdentity = path => path.replaceAll('\\', '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '').toLowerCase()
let pageSequence=0
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if(command==='close_knowledge_search')return true
  if(command==='search_knowledge_page'||command==='search_knowledge_libraries_page'){
    // Keep the historical navigation scenarios runnable against the current UI.
    // Only this isolated IPC adapter translates its small fixture result set.
    const multi=command==='search_knowledge_libraries_page',request=args.request
    const old=await window.__TAURI_INTERNALS__.invoke(multi?'search_knowledge_libraries':'search_knowledge',request)
    const matches=multi?old.results:old, files=matches.map(match=>({path:match.path,title:match.title,matches:[match],mayHaveMoreMatches:false,locationLimitPerKind:5,unlocatedLimitPerKind:1,libraryRoot:pathIdentity(match.path).startsWith(pathIdentity(root)+'/')?root:'C:/study-fixture',libraryName:pathIdentity(match.path).startsWith(pathIdentity(root)+'/')?'项目资料库':'学习资料库'}))
    const limited=multi&&old.limitReached
    return {sessionId:'navigation-'+(++pageSequence),snapshotId:'navigation-view',files,pageOffset:0,nextCursor:null,scanState:limited?'limited':'ready',scanComplete:!limited,totalFiles:limited?null:files.length,warnings:multi?old.warnings:[],...(multi?{availableFiles:files.length,libraries:[{libraryRoot:root,libraryName:'项目资料库',state:'ready',totalFiles:files.length,availableFiles:files.length},...(limited?[{libraryRoot:'C:/offline',libraryName:'离线资料库',state:'unavailable',totalFiles:null,availableFiles:0}]:[])]}:{})}
  }
  if (command === 'scan_directory' && audit.canonicalDirectory) {
    const plain = args.path.replace(/^\\\\\?\\/, '').replaceAll('\\', '/')
    const entries = await original(command, { ...args, path: plain })
    return entries.map(entry => ({ ...entry, path: '\\\\?\\' + entry.path.replaceAll('/', '\\') }))
  }
  if (command === 'scan_directory' && audit.slowDirectory && args.path === 'C:/study-fixture') await new Promise(resolve => setTimeout(resolve, 250))
  // Model the same file returned by Windows canonicalize; do not strip the
  // result before the production component checks configured library membership.
  if (command === 'read_text_document' && args.path === nativePath) return original(command, { ...args, path: root + '/项目预算.txt' })
  if (command === 'save_config' && audit.holdConfigSave) return new Promise((resolve, reject) => audit.configSaves.push(async () => { try { resolve(await original(command, args)) } catch (cause) { reject(cause) } }))
  if (command === 'search_knowledge_libraries' || command === 'search_knowledge') {
    audit.searchCalls.push({ command, args })
    if (args.query === '错误') throw Error('模拟资料库不可读，请检查路径后重试')
    let results = args.query === '空结果' ? [] : args.query === '跨库' ? [hit('跨库笔记.md', 'C:/study-fixture/跨库笔记.md', 'markdown', '跨库正文')] : hits
    if (args.query === '项目预算确认') results = [hit('项目预算.txt', nativePath, 'plain-text', '项目预算确认')]
    if (args.query === '跨库文本') results = [hit('跨库资料.txt', 'C:/study-fixture/跨库资料.txt', 'plain-text', '项目预算另库资料')]
    if (args.query === '很多') results = Array.from({ length: 32 }, (_, index) => hit(`项目资料${index + 1}.txt`, root + `/项目资料${index + 1}.txt`, 'plain-text', '预算资料'))
    if (args.query === '慢') return new Promise(resolve => audit.slow.push(() => resolve(command === 'search_knowledge' ? [hit('过期结果.md', root + '/过期结果.md', 'markdown', '过期')] : { results: [hit('过期结果.md', root + '/过期结果.md', 'markdown', '过期')], warnings: [], limitReached: false })))
    if (args.libraryRoot) results = results.filter(result => pathIdentity(result.path).startsWith(pathIdentity(args.libraryRoot) + '/'))
    return command === 'search_knowledge' ? results : { results, warnings: args.query === '部分' ? ['离线资料库暂时无法读取'] : [], limitReached: args.query === '部分' }
  }
  return original(command, args)
}
