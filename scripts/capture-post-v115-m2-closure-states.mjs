import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = path.resolve(process.env.LONGEDIT_M2_CLOSURE_OUTPUT)
const library = path.resolve(process.env.LONGEDIT_M2_CLOSURE_LIBRARY)
const missing = `${library}-temporarily-missing`
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
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
const wait = async (expression, description) => { for (let attempt = 0; attempt < 600; attempt += 1) { if (await evaluate(expression)) return; await delay(50) } throw new Error(`Timeout: ${description}`) }
const click = async selector => { const clicked = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!(e instanceof HTMLElement))return false;e.click();return true})()`); if (!clicked) throw new Error(`Cannot click ${selector}`) }
const capture = async name => { const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true }); await fs.writeFile(path.join(output, name), Buffer.from(image.data, 'base64')) }

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false })
await wait(`document.querySelector('.library-mode')!==null`, 'empty library initialization')
await evaluate(`window.__m2EmptyLoading=false;window.__m2EmptyObserver=new MutationObserver(()=>{if(document.querySelector('[data-testid="m2-closure-loading"]'))window.__m2EmptyLoading=true});window.__m2EmptyObserver.observe(document.body,{subtree:true,childList:true});location.hash='#/workspace'`)
await wait(`document.querySelector('[data-testid="m2-closure-empty"]')!==null`, 'configured empty state')
const emptyStateVisible = true
const loadingStateObserved = await evaluate(`window.__m2EmptyLoading===true`)
await capture('empty-workspace-720.jpg')

await fs.rename(library, missing)
await click('.workspace-nav button:last-child')
await wait(`document.querySelector('.workspace-alert')!==null`, 'real missing-directory failure')
const failureStateVisible = true
await capture('failure-workspace-720.jpg')
await fs.rename(missing, library)
await click('.workspace-alert button')
await wait(`document.querySelector('[data-testid="m2-closure-empty"]')!==null&&!document.querySelector('.workspace-alert')`, 'failure retry recovery')
const failureRetryRecovered = true
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await delay(300)
const responsive480 = await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`)
await capture('empty-workspace-480.jpg')
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)
await fs.writeFile(path.join(output, 'state-evidence.json'), `${JSON.stringify({ stage: 'M2-closure-states', actual: { loadingStateObserved, emptyStateVisible, failureStateVisible, failureRetryRecovered, responsive480, runtimeErrors: runtimeErrors.length }, evidenceFiles: ['empty-workspace-720.jpg', 'failure-workspace-720.jpg', 'empty-workspace-480.jpg'] }, null, 2)}\n`)
socket.close()
console.log('M2 closure empty, loading, failure and retry audit passed')
