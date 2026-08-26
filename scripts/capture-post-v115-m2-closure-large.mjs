import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M2_CLOSURE_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M2_CLOSURE_LIBRARY)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const hashDirectory = async root => {
  const files = []
  const walk = async directory => { for (const entry of await fs.readdir(directory, { withFileTypes: true })) { const full = path.join(directory, entry.name); entry.isDirectory() ? await walk(full) : files.push(full) } }
  await walk(root)
  const digest = crypto.createHash('sha256')
  for (const file of files.sort()) { digest.update(path.relative(root, file).replaceAll('\\', '/')); digest.update(await fs.readFile(file)) }
  return digest.digest('hex')
}
const countFiles = async root => { let count = 0; const walk = async directory => { for (const entry of await fs.readdir(directory, { withFileTypes: true })) entry.isDirectory() ? await walk(path.join(directory, entry.name)) : count += 1 }; await walk(root); return count }
const beforeSha256 = await hashDirectory(library)
const beforeMarkdown = new Set((await fs.readdir(library)).filter(name => name.toLowerCase().endsWith('.md')))

let target
for (let attempt = 0; attempt < 180 && !target; attempt += 1) { const targets = await fetch(`${endpoint}/json`).then(response => response.json()); target = targets.find(item => item.type === 'page' && /127\.0\.0\.1:9000|localhost:9000/.test(item.url)); if (!target) await delay(100) }
if (!target?.webSocketDebuggerUrl) throw new Error('WebView target missing')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let id = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception'); if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text); const request = pending.get(message.id); if (!request) return; pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })) })
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
const wait = async (expression, description) => { for (let attempt = 0; attempt < 800; attempt += 1) { if (await evaluate(expression)) return; await delay(50) } const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,1800)})`); throw new Error(`Timeout: ${description}; ${JSON.stringify(state)}`) }
const click = async selector => { const clicked = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!(e instanceof HTMLElement))return false;e.click();return true})()`); if (!clicked) throw new Error(`Cannot click ${selector}`) }
const pressEnter = async selector => {
  const focused = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!(e instanceof HTMLElement))return false;e.focus();return document.activeElement===e})()`)
  if (!focused) throw new Error(`Cannot focus ${selector}`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}
const pressKey = async (key, code, virtualKeyCode) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode })
}
const capture = async name => { const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true }); await fs.writeFile(path.join(output, name), Buffer.from(image.data, 'base64')) }
const resize = async (width, height) => { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await delay(250) }

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await resize(1280, 820)
await wait(`document.querySelector('.library-mode')!==null`, 'library initialization')
await evaluate(`window.__m2LoadingObserved=false;window.__m2Observer=new MutationObserver(()=>{if(document.querySelector('[data-testid="m2-closure-loading"]'))window.__m2LoadingObserved=true});window.__m2Observer.observe(document.body,{subtree:true,childList:true});location.hash='#/workspace'`)
const startedAt = Date.now()
await wait(`document.querySelector('[data-testid="m2a2-workspace-primary"]')?.getAttribute('data-primary-state')==='ready'`, 'large workspace ready')
const primaryReadyMs = Date.now() - startedAt
const loadingStateObserved = await evaluate(`window.__m2LoadingObserved===true`)
await capture('large-workspace-1280.jpg')

await pressEnter('[data-testid="m2-closure-create"]')
await wait(`document.querySelector('.n-dropdown-menu')!==null`, 'keyboard create menu')
const keyboardCreateMenu = true
await pressKey('ArrowDown', 'ArrowDown', 40)
await pressKey('Enter', 'Enter', 13)
await wait(`document.querySelector('.library-mode')!==null`, 'created Markdown opened')
let createdMarkdown = ''
for (let attempt = 0; attempt < 100 && !createdMarkdown; attempt += 1) {
  const names = (await fs.readdir(library)).filter(name => name.toLowerCase().endsWith('.md'))
  createdMarkdown = names.find(name => !beforeMarkdown.has(name)) || ''
  if (!createdMarkdown) await delay(50)
}
if (!createdMarkdown) throw new Error('Created Markdown missing from real library')
const createdPath = path.join(library, createdMarkdown)
const markdownCreatedAndOpened = await evaluate(`decodeURIComponent(location.href).includes(${JSON.stringify(createdMarkdown)})`)
if (!markdownCreatedAndOpened) throw new Error('Created Markdown did not open in editor')

await evaluate(`location.hash='#/workspace'`)
await wait(`document.querySelector('[data-testid="m2a2-workspace-primary"]')?.getAttribute('data-primary-state')==='ready'`, 'workspace reopened')
await pressEnter('[data-testid="m2-closure-open"]')
await wait(`document.querySelector('.library-mode')!==null`, 'keyboard open library')
const keyboardOpenLibrary = true
await evaluate(`location.hash='#/workspace'`)
await wait(`document.querySelector('[data-testid="m2a1-task-section"] .task-open')!==null`, 'workspace task ready')
await click('[data-testid="m2a1-task-section"] .task-open')
await wait(`document.querySelector('[data-workspace-task-line="3"]')!==null`, 'task line highlighted in editor')
const taskLineLocated = await evaluate(`Number(document.querySelector('[data-workspace-task-line]')?.getAttribute('data-workspace-task-line'))`)
await capture('task-locator-1280.jpg')

await fs.unlink(createdPath)
const afterCleanupSha256 = await hashDirectory(library)
const createdFileCleanupByteExact = beforeSha256 === afterCleanupSha256
await evaluate(`location.hash='#/workspace'`)
await wait(`document.querySelector('[data-testid="m2a2-workspace-primary"]')?.getAttribute('data-primary-state')==='ready'`, 'responsive workspace ready')
await resize(720, 680)
const responsive720 = await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`)
await capture('large-workspace-720.jpg')
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)
await fs.writeFile(path.join(output, 'large-evidence.json'), `${JSON.stringify({ stage: 'M2-closure-large', actual: { largeFixtureFileCount: await countFiles(library), primaryReadyMs, loadingStateObserved, keyboardCreateMenu, markdownCreatedAndOpened, createdFileCleanupByteExact, keyboardOpenLibrary, taskLineLocated, responsive720, runtimeErrors: runtimeErrors.length, beforeSha256, afterCleanupSha256 }, evidenceFiles: ['large-workspace-1280.jpg', 'task-locator-1280.jpg', 'large-workspace-720.jpg'] }, null, 2)}\n`)
socket.close()
console.log('M2 closure large workspace and action audit passed')
