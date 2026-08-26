import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M2A3_AUDIT_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M2A3_LIBRARY)
const pinnedCanvas = path.resolve(process.env.LONGEDIT_M2A3_PINNED_CANVAS)
const taskFile = path.resolve(process.env.LONGEDIT_M2A3_TASK_FILE)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const hashDirectory = async root => {
  const files = []
  const walk = async directory => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      entry.isDirectory() ? await walk(full) : files.push(full)
    }
  }
  await walk(root)
  const digest = crypto.createHash('sha256')
  for (const file of files.sort()) {
    digest.update(path.relative(root, file).replaceAll('\\', '/'))
    digest.update(await fs.readFile(file))
  }
  return digest.digest('hex')
}

const beforeSha256 = await hashDirectory(library)
let target
for (let attempt = 0; attempt < 180 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page' && /127\.0\.0\.1:9000|localhost:9000/.test(item.url))
  if (!target) await delay(100)
}
if (!target?.webSocketDebuggerUrl) throw new Error('WebView target missing')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let id = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text)
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id
  pending.set(requestId, { resolve, reject })
  socket.send(JSON.stringify({ id: requestId, method, params }))
})
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
const wait = async (expression, description) => {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(50)
  }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,2400),rows:document.querySelectorAll('[data-testid="m2a3-task-results"] .task-row').length,primary:document.querySelector('[data-testid="m2a2-workspace-primary"]')?.getAttribute('data-primary-state')})`)
  throw new Error(`Timeout: ${description}; state=${JSON.stringify(state)}`)
}
const click = async selector => {
  const clicked = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!(e instanceof HTMLButtonElement)||e.disabled)return false;e.click();return true})()`)
  if (!clicked) throw new Error(`Cannot click ${selector}`)
}
const clickDialog = async label => {
  const clicked = await evaluate(`(()=>{const e=[...document.querySelectorAll('.n-dialog__action button')].find(x=>x.textContent?.includes(${JSON.stringify(label)}));if(!(e instanceof HTMLButtonElement))return false;e.click();return true})()`)
  if (!clicked) throw new Error(`Cannot click dialog action ${label}`)
}
const clickStatus = async label => {
  const clicked = await evaluate(`(()=>{const e=[...document.querySelectorAll('[data-testid="m2a3-task-filters"] button')].find(x=>x.textContent?.trim()===${JSON.stringify(label)});if(!(e instanceof HTMLButtonElement))return false;e.click();return true})()`)
  if (!clicked) throw new Error(`Cannot click task status ${label}`)
}
const select = async (label, value) => {
  const changed = await evaluate(`(()=>{const e=document.querySelector('select[aria-label=${JSON.stringify(label)}]');if(!(e instanceof HTMLSelectElement))return false;e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  if (!changed) throw new Error(`Cannot change select ${label}`)
  await delay(150)
}
const capture = async name => {
  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true })
  await fs.writeFile(path.join(output, name), Buffer.from(screenshot.data, 'base64'))
}
const resize = async (width, height) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await delay(300)
}
const pathIdentity = value => value.replace(/^\\\\\?\\/, '').replaceAll('\\', '/').toLocaleLowerCase()

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await resize(1280, 820)
await wait(`document.querySelector('.library-mode')!==null`, 'library initialization')
const recentPlan = path.join(library, '01-行动计划.md')
const recentTarget = path.join(library, '02-目标说明.md')
await evaluate(`localStorage.setItem('longedit_tabs_state',${JSON.stringify(JSON.stringify({ tabs: [], activeTabId: null, starredFiles: [pinnedCanvas], recentFiles: [{ title: '行动计划', path: recentPlan }, { title: '目标说明', path: recentTarget }, { title: '重复画布', path: pinnedCanvas }] }))});location.reload()`)
await wait(`document.querySelector('.library-mode')!==null`, 'library reload with navigation history')
await evaluate(`location.hash='#/workspace'`)
await wait(`document.querySelector('[data-testid="m2a2-workspace-primary"]')?.getAttribute('data-primary-state')==='ready'`, 'workspace ready')
await wait(`document.querySelectorAll('[data-testid="m2a3-task-results"] .task-row').length===5`, 'five open tasks')

const pinnedIdentity = pathIdentity(pinnedCanvas)
const navigation = await evaluate(`(()=>{const groups=document.querySelectorAll('[data-testid="m2a3-continue-work"] .continue-group');const occurrences=[...document.querySelectorAll('[data-file-path]')].filter(e=>e.getAttribute('data-file-path')===${JSON.stringify(pinnedIdentity)}).length;return{groups:groups.length,occurrences,text:document.querySelector('[data-testid="m2a3-continue-work"]')?.innerText||''}})()`)
if (navigation.groups !== 3 || navigation.occurrences !== 1) throw new Error(`Continue work consolidation failed: ${JSON.stringify(navigation)}`)
const openTaskCount = await evaluate(`document.querySelectorAll('[data-testid="m2a3-task-results"] .task-row').length`)
await capture('workspace-open-1280.jpg')

await clickStatus('已完成')
await wait(`document.querySelectorAll('[data-testid="m2a3-task-results"] .task-row').length===2`, 'two completed tasks')
const completedTaskCount = await evaluate(`document.querySelectorAll('[data-testid="m2a3-task-results"] .task-row').length`)
await select('按优先级筛选待办', 'medium')
await select('按日期筛选待办', 'overdue')
const completedMediumOverdueCount = await evaluate(`document.querySelectorAll('[data-testid="m2a3-task-results"] .task-row').length`)
if (completedMediumOverdueCount !== 1) throw new Error('Completed medium overdue filter mismatch')
await capture('workspace-completed-filter-1280.jpg')

await clickStatus('未完成')
await select('按优先级筛选待办', 'high')
await select('按日期筛选待办', 'today')
await wait(`document.querySelectorAll('[data-testid="m2a3-task-results"] .task-row').length===1`, 'one high priority task due today')
const highPriorityTodayCount = await evaluate(`document.querySelectorAll('[data-testid="m2a3-task-results"] .task-row').length`)
await click('[data-testid="m2a1-task-complete"]')
await wait(`document.querySelector('.n-dialog__action')!==null`, 'task completion confirmation')
await clickDialog('完成待办')
await wait(`document.querySelector('[data-testid="m2a1-task-undo"]')!==null`, 'task completion persisted')
const completedText = await fs.readFile(taskFile, 'utf8')
const taskCompletionPersisted = completedText.includes('- [x] Today urgent !high')
if (!taskCompletionPersisted) throw new Error('Task completion did not persist to Markdown')
await click('[data-testid="m2a1-task-undo"]')
await wait(`document.querySelector('[data-testid="m2a1-task-complete"]')!==null`, 'task restored')
const afterRestoreSha256 = await hashDirectory(library)
const taskRestoreByteExact = beforeSha256 === afterRestoreSha256
if (!taskRestoreByteExact) throw new Error('Task restore did not preserve byte-exact fixture')
await delay(3600)

const responsive = {}
for (const [width, height] of [[1280, 820], [1000, 720], [720, 680], [480, 700]]) {
  await resize(width, height)
  responsive[width] = await evaluate(`(()=>{const e=document.querySelector('.workspace-home');return Boolean(e&&document.documentElement.scrollWidth<=document.documentElement.clientWidth+1&&document.querySelector('[data-testid="m2a3-task-filters"]'))})()`)
  if (!responsive[width]) throw new Error(`${width}px workspace overflow`)
  await capture(`workspace-${width}.jpg`)
}
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)

const actual = {
  duplicateCanvasOccurrences: navigation.occurrences,
  continueGroupCount: navigation.groups,
  openTaskCount,
  completedTaskCount,
  highPriorityTodayCount,
  completedMediumOverdueCount,
  taskCompletionPersisted,
  taskRestoreByteExact,
  responsive1280: responsive[1280],
  responsive1000: responsive[1000],
  responsive720: responsive[720],
  responsive480: responsive[480],
  runtimeErrors: runtimeErrors.length,
  beforeSha256,
  afterRestoreSha256
}
await fs.writeFile(path.join(output, 'desktop-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'M2A3',
  expectedVsPrevious: {
    previousDuplicateCanvasSurfaces: 3,
    currentDuplicateCanvasSurfaces: navigation.occurrences,
    previousTaskFilters: 0,
    currentTaskFilters: 4,
    previousCompletedTaskManagement: false,
    currentCompletedTaskManagement: true
  },
  actual,
  evidenceFiles: ['workspace-open-1280.jpg', 'workspace-completed-filter-1280.jpg', 'workspace-1280.jpg', 'workspace-1000.jpg', 'workspace-720.jpg', 'workspace-480.jpg'],
  sourceUserContentIncluded: false,
  releaseCandidate: false
}, null, 2)}\n`)
socket.close()
console.log('M2A3 real Tauri workspace navigation and task filter audit passed')
