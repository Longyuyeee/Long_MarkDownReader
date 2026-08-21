import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14523'
const output = path.resolve('docs/evidence/user-facing-terminology')
const pptxPath = process.env.LONGEDIT_TERMINOLOGY_PPTX
if (!pptxPath) throw new Error('Terminology PPTX fixture is missing')
const sourceBefore = await fs.readFile(pptxPath)
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
if (!target) throw new Error('LongEdit WebView target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'WebView log error')
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description) => {
  for (let index = 0; index < 900; index += 1) { if (await evaluate(expression)) return; await delay(100) }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const blocked = ['GRAPH HEALTH', 'LOCAL GRAPH', 'GOVERNANCE', 'ACTIVE WORKSPACE', 'ACTIVITY', 'KNOWLEDGE HEALTH', 'OPEN TASKS', 'SAVED VIEWS', 'C4A', 'C4B', 'C4C', 'C4D', 'C5A', 'C5B', 'C5C']

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')`, 'library shell')
await evaluate(`location.hash = '#/workspace'`)
await waitFor(`document.querySelector('.workspace-home .section-kicker')`, 'workspace overview')
await delay(300)
const workspace = await evaluate(`(() => ({
  labels: [...document.querySelectorAll('.workspace-home .section-kicker, .governance-queue .queue-heading span')].map(node => node.textContent?.trim()),
  text: document.querySelector('.workspace-home')?.textContent || '',
  overflow: document.documentElement.scrollWidth - innerWidth,
}))()`)
await capture('workspace-plain-language.png')

await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(pptxPath)})`)
await waitFor(`document.querySelector('.pptx-workspace') && document.querySelector('.pptx-details')`, 'PPTX workspace')
const prepared = await evaluate(`(() => {
  if (document.querySelector('.isolated-text-patch')) return true
  const button = [...document.querySelectorAll('.toolbar-actions button')].find(node => node.textContent?.includes('编辑准备'))
  if (!(button instanceof HTMLButtonElement)) return false
  button.click(); return true
})()`)
if (!prepared) throw new Error('PPTX edit preparation button was not found')
await waitFor(`document.querySelector('.isolated-text-patch')`, 'PPTX safe edit panels')
await delay(300)
const pptx = await evaluate(`(() => ({
  headings: [...document.querySelectorAll('.pptx-details section > header strong')].map(node => node.textContent?.trim()),
  text: document.querySelector('.pptx-details')?.textContent || '',
  overflow: document.documentElement.scrollWidth - innerWidth,
}))()`)
await capture('pptx-plain-language.png')

const expectedWorkspace = ['当前工作区', '最近活动', '关系概览', '未完成事项', '可视画布', '快捷视图', '资料治理']
const expectedPptx = ['编辑安全基线', '文本编辑预览', '样式与替代文本', '图片替换', '基础形状', '幻灯片管理']
const blockedPresent = blocked.filter(token => workspace.text.includes(token) || pptx.text.includes(token))
const sourceAfter = await fs.readFile(pptxPath)
const sourceUnchanged = Buffer.compare(sourceBefore, sourceAfter) === 0
const passed = expectedWorkspace.every(label => workspace.labels.includes(label))
  && expectedPptx.every(label => pptx.headings.includes(label))
  && blockedPresent.length === 0
  && workspace.overflow <= 2 && pptx.overflow <= 2
  && sourceUnchanged && runtimeErrors.length === 0
if (!passed) throw new Error(`Terminology runtime gate failed: ${JSON.stringify({ workspace, pptx, blockedPresent, sourceUnchanged, runtimeErrors })}`)

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  status: 'accepted',
  expected: { workspace: expectedWorkspace, pptx: expectedPptx, blocked },
  actual: { workspace, pptx, blockedPresent, sourceUnchanged, sourceSha256: crypto.createHash('sha256').update(sourceAfter).digest('hex'), runtimeErrorCount: runtimeErrors.length },
  passed,
}, null, 2)}\n`)
socket.close()
console.log('User-facing terminology desktop audit passed.')
