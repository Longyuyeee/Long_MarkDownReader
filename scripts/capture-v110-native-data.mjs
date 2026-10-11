// Command-level integration through real Tauri IPC; no desktop input or mocked IPC.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { execFileSync } from 'node:child_process'
const endpoint = process.env.LONGEDIT_CDP_ENDPOINT, root = process.env.LONGEDIT_E2E_LIBRARY, output = process.env.LONGEDIT_UX26_OUTPUT
if (!endpoint || !root || !output || !process.env.LONGEDIT_E2E_CONFIG_DIR || !root.includes('longedit-v110-data-')) throw Error('Isolated runner required')
let target
for (let i = 0; i < 100; i++) {
  try { target = (await fetch(`${endpoint}/json`).then(r => r.json())).find(t => t.type === 'page'); if (target) break } catch {}
  await new Promise(r => setTimeout(r, 100))
}
if (!target) throw Error('Isolated native WebView unavailable')
const socket = new WebSocket(target.webSocketDebuggerUrl); await once(socket, 'open')
let id = 0; const pending = new Map()
socket.addEventListener('message', event => { const data = JSON.parse(event.data), request = pending.get(data.id); if (!request) return; pending.delete(data.id); clearTimeout(request.timer); data.error ? request.reject(Error(JSON.stringify(data.error))) : request.resolve(data.result) })
const evaluate = expression => new Promise((resolve, reject) => {
  const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error('Native IPC timeout')) }, 30000)
  pending.set(key, { timer, reject, resolve: result => result.exceptionDetails ? reject(Error(JSON.stringify(result.exceptionDetails))) : resolve(result.result.value) })
  socket.send(JSON.stringify({ id: key, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }))
})
const invoke = (command, args = {}) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`)
const checks = [], check = (label, truth) => { assert.ok(truth, label); checks.push(label) }
try {
  for (let i = 0; i < 100; i++) { if (await evaluate('!!window.__TAURI_INTERNALS__')) break; await new Promise(r => setTimeout(r, 100)) }
  const config = await invoke('get_config')
  const filters = { directory: 'project', tag: '项目', modifiedWithinDays: 7 }
  const file = path.join(root, 'project', 'target.md')
  if (process.argv[2] === 'restart') {
    const collection = config.savedSearches.find(s => s.id === 'native-collection')
    check('fresh process restores persisted smart collection', collection?.filters?.tag === '项目')
    const results = await invoke('search_smart_collection', { libraryRoot: root, query: '', objectTypes: ['markdown'], filters: collection.filters })
    check('fresh process searches live matching files', results.results.some(r => r.path.endsWith('target.md')))
    const versions = await invoke('list_history', { libraryRoot: root, path: file })
    check('protected draft survives process restart', versions.some(([, content]) => content === '用户未保存草稿'))
    const saved = JSON.parse(await fs.readFile(path.join(output, 'initial.json'), 'utf8'))
    check('recovery copy reopens from disk after restart', await fs.readFile(saved.copyPath, 'utf8') === '历史内容 #项目')
  } else {
    await fs.mkdir(path.join(root, 'project'))
    await Promise.all(Array.from({ length: 1000 }, (_, i) => fs.writeFile(path.join(root, `excluded-${i}.md`), '# 不匹配的文件')))
    await fs.writeFile(file, '当前正文 #项目')
    const started = performance.now()
    const results = await invoke('search_smart_collection', { libraryRoot: root, query: '', objectTypes: ['markdown'], filters })
    check('real native filtered search returns target', results.results.length === 1 && results.results[0].path.endsWith('target.md'))
    const queryMs = Math.round(performance.now() - started)
    const captureArgs = { libraryRoot: root, targetDir: path.join(root, 'project'), operationId: '0123456789abcdef0123456789abcdef', content: '直接保存的会议笔记' }
    const captured = await invoke('save_quick_note', captureArgs)
    check('quick note writes directly to the chosen directory', path.basename(path.dirname(captured)) === 'project' && await fs.readFile(captured, 'utf8') === captureArgs.content)
    check('same quick-save operation retries without duplication', await invoke('save_quick_note', captureArgs) === captured)
    config.savedSearches = [{ id: 'native-collection', name: '本周项目', query: '', libraryPath: root, objectTypes: ['markdown'], filters, createdAt: Date.now() }]
    await invoke('save_config', { config })
    check('collection written to isolated config on disk', JSON.parse(await fs.readFile(path.join(process.env.LONGEDIT_E2E_CONFIG_DIR, 'config.json'), 'utf8')).savedSearches[0].filters.directory === 'project')
    await invoke('save_history_version', { libraryRoot: root, path: file, content: '历史内容 #项目', maxCount: 20 })
    const [[timestamp]] = await invoke('list_history', { libraryRoot: root, path: file })
    const comparison = await invoke('compare_history_version', { libraryRoot: root, path: file, timestamp })
    const args = { libraryRoot: root, path: file, timestamp, diskSignature: comparison.diskSignature, historySignature: comparison.historySignature }
    const copyPath = await invoke('restore_history_copy', args)
    check('copy contains historical content without overwriting original', await fs.readFile(copyPath, 'utf8') === '历史内容 #项目' && await fs.readFile(file, 'utf8') === '当前正文 #项目')
    const content = await invoke('prepare_history_restore', { ...args, currentDraft: '用户未保存草稿', maxCount: 20 })
    check('replacement preparation returns selected snapshot', content === '历史内容 #项目')
    check('draft protection is physically persisted', (await invoke('list_history', { libraryRoot: root, path: file })).some(([, value]) => value === '用户未保存草稿'))
    await fs.writeFile(file, '外部修改 #项目')
    await assert.rejects(invoke('restore_history_copy', args), /变化/)
    check('external modification rejects stale recovery', await fs.readFile(file, 'utf8') === '外部修改 #项目')
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'initial.json'), JSON.stringify({ checks, queryMs, fixtureFiles: 1001, copyPath, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scope: 'Real debug Tauri IPC and disk, not UI or release-package acceptance' }, null, 2))
  }
  if (process.argv[2] === 'restart') await fs.writeFile(path.join(output, 'restart.json'), JSON.stringify({ checks, scope: 'Fresh isolated debug process, real Tauri IPC' }, null, 2))
  console.log(JSON.stringify({ phase: process.argv[2], checks }))
} finally { socket.close() }
