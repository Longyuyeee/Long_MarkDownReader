import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14527'
const output = path.resolve('docs/evidence/post-v1013-sidebar-information-architecture')
const samplePath = process.env.LONGEDIT_SIDEBAR_SAMPLE_PATH
if (!samplePath) throw new Error('LONGEDIT_SIDEBAR_SAMPLE_PATH is required')
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
let target
for (let attempt = 0; attempt < 100 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page'
    && (item.url.includes('127.0.0.1:9000') || item.url.includes('tauri.localhost'))
    && item.webSocketDebuggerUrl)
  if (!target) await delay(100)
}
if (!target) throw new Error('LongEdit Tauri WebView target was not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception')
  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
    runtimeErrors.push(message.params.args?.map(argument => argument.value || argument.description || '').join(' ') || 'Console error')
  }
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const inspectPanel = tab => evaluate(`(() => {
  const sidebar = document.querySelector('.sidebar')
  const panel = document.querySelector('#panel-${tab}')
  const sidebarRect = sidebar?.getBoundingClientRect()
  const panelRect = panel?.getBoundingClientRect()
  const tabs = [...document.querySelectorAll('.icon-tab')].map(item => ({
    id: item.id,
    label: item.textContent?.trim(),
    title: item.getAttribute('title'),
    ariaLabel: item.getAttribute('aria-label'),
  }))
  return {
    tab: ${JSON.stringify(tab)},
    sidebar: sidebarRect && { x: sidebarRect.x, width: sidebarRect.width, right: sidebarRect.right },
    panel: panelRect && { x: panelRect.x, width: panelRect.width, right: panelRect.right, scrollWidth: panel.scrollWidth },
    panelOverflowX: panel ? Math.max(0, panel.scrollWidth - panel.clientWidth) : null,
    pageOverflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    tabs,
    text: panel?.textContent?.replace(/\\s+/g, ' ').trim(),
    hasLocalGraphCanvas: Boolean(panel?.querySelector('.local-graph-card, .local-graph-canvas')),
  }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 720, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && document.querySelector('.page-loader') === null`, 'library shell')
await evaluate(`location.hash = '#/library?path=' + encodeURIComponent(${JSON.stringify(samplePath)})`)
await waitFor(`document.querySelector('.workspace-tab.active')?.textContent?.includes('Relation Entry Test')`, 'sample Markdown tab')
await delay(700)
await evaluate(`([...document.querySelectorAll('button')].find(button => button.textContent?.includes('稍后提醒')))?.click()`)
await waitFor(`![...document.querySelectorAll('.update-modal')].some(element => element.getBoundingClientRect().width > 0)`, 'update prompt dismissal')

const entries = []
for (const tab of ['collections', 'outline', 'tags', 'links', 'quick', 'history']) {
  await evaluate(`document.querySelector('#tab-${tab}')?.click()`)
  await waitFor(`document.querySelector('#panel-${tab}') !== null`, `${tab} panel`)
  if (tab === 'links') {
    await waitFor(`document.querySelector('#panel-links .relation-overview')?.textContent?.includes('1 链出')`, 'outgoing relation count')
    await waitFor(`document.querySelector('#panel-links .relation-overview')?.textContent?.includes('1 链入')`, 'incoming relation count')
  }
  await delay(350)
  entries.push(await inspectPanel(tab))
  await capture(`sidebar-${tab}-900x720.png`)
}

const tabLabels = entries[0].tabs.map(tab => tab.label)
const descriptionsComplete = entries[0].tabs.every(tab => tab.title?.includes('：') && tab.ariaLabel === tab.title)
const relationEntry = entries.find(entry => entry.tab === 'links')
const searchEntry = entries.find(entry => entry.tab === 'collections')
const tagsEntry = entries.find(entry => entry.tab === 'tags')
const passed = JSON.stringify(tabLabels) === JSON.stringify(['文件', '目录', '最近', '备份', '常用搜索', '关系', '标签'])
  && descriptionsComplete
  && entries.every(entry => entry.sidebar.width <= 262 && entry.panelOverflowX <= 2 && entry.pageOverflowX <= 2)
  && searchEntry.text.includes('记录文件页的关键词和格式条件')
  && tagsEntry.text.includes('仅 Markdown') && tagsEntry.text.includes('#标签名')
  && relationEntry.text.includes('1 链出') && relationEntry.text.includes('1 链入')
  && relationEntry.text.includes('在知识图谱中查看')
  && !relationEntry.hasLocalGraphCanvas
  && runtimeErrors.length === 0

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  status: passed ? 'accepted' : 'rejected',
  expected: {
    labels: ['文件', '目录', '最近', '备份', '常用搜索', '关系', '标签'],
    sidebarMaximumWidthPx: 262,
    relationSummary: { outgoing: 1, incoming: 1, embeddedGraphRemoved: true },
  },
  actual: { entries, runtimeErrorCount: runtimeErrors.length, runtimeErrors },
  passed,
}, null, 2)}\n`)
socket.close()
if (!passed) throw new Error('Sidebar information architecture audit failed')
console.log('Sidebar information architecture Tauri audit passed.')
