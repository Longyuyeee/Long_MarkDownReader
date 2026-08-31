import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const origin = process.env.LONGEDIT_M5_3_APP_ORIGIN
const output = path.resolve(process.env.LONGEDIT_M5_3_AUDIT_OUTPUT || '.')
const bridge = path.resolve(process.env.LONGEDIT_M5_3_RESULT_BRIDGE || '')
const cases = JSON.parse(process.env.LONGEDIT_M5_3_CASES || '[]')
const complexSource = path.resolve(process.env.LONGEDIT_M5_3_COMPLEX_SOURCE || '')
if (!endpoint || !origin || !bridge || cases.length !== 2 || !complexSource) throw new Error('M5-3 desktop environment is incomplete')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const waitForPage = async () => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const pages = await (await fetch(`${endpoint}/json`)).json()
      const page = pages.find(item => item.type === 'page' && item.url.startsWith(origin) && item.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await delay(250)
  }
  throw new Error('M5-3 Tauri WebView target missing after 60 seconds')
}
const page = await waitForPage()
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'log error')
  if (!pending.has(message.id)) return
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, label, attempts = 500) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(await evaluate(`({hash:location.hash,text:document.body?.innerText?.slice(0,1600)})`))}`)
}
const capture = async file => {
  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(screenshot.data, 'base64'))
}
const clickByLabel = label => evaluate(`(() => { const e=[...document.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===${JSON.stringify(label)}&&!node.disabled);if(!(e instanceof HTMLButtonElement))return false;e.click();return true })()`)
const setTextarea = value => evaluate(`(() => { const e=document.querySelector('[data-testid="m5-3-odp-text-editor"]');if(!(e instanceof HTMLTextAreaElement))return false;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true })()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')!==null && !document.querySelector('.page-loader')`, 'library initialization')

const results = []
for (const [caseIndex, testCase] of cases.entries()) {
  const source = path.resolve(testCase.source)
  const target = path.resolve(testCase.target)
  const sourceBefore = await digest(source)
  await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(source)})`)
  await waitFor(`document.querySelector('[data-testid="m5-3-odp-edit-banner"]') && document.querySelectorAll('.odp-target-list button').length===2`, `${testCase.producer} editable workspace`)
  const initialText = await evaluate(`document.querySelector('.odp-target-list button strong')?.textContent?.trim() || ''`)
  if (!initialText.includes(testCase.original)) throw new Error(`${testCase.producer} original marker missing: ${initialText}`)
  await evaluate(`document.querySelector('.odp-target-list button')?.click()`)
  await waitFor(`document.querySelector('[data-testid="m5-3-odp-text-editor"]')`, `${testCase.producer} editor`)
  if (!await setTextarea(testCase.replacement)) throw new Error(`${testCase.producer} draft input failed`)
  await waitFor(`document.querySelector('[data-testid="m5-3-odp-text-editor"]')?.value===${JSON.stringify(testCase.replacement)}`, `${testCase.producer} draft`)
  if (await digest(source) !== sourceBefore) throw new Error(`${testCase.producer} source changed during draft`)

  if (caseIndex === 0) {
    if (!await clickByLabel('撤销正文修改')) throw new Error('ODP undo unavailable')
    await waitFor(`document.querySelector('[data-testid="m5-3-odp-text-editor"]')?.value.includes(${JSON.stringify(testCase.original)})`, 'ODP undo')
    if (!await clickByLabel('重做正文修改')) throw new Error('ODP redo unavailable')
    await waitFor(`document.querySelector('[data-testid="m5-3-odp-text-editor"]')?.value===${JSON.stringify(testCase.replacement)}`, 'ODP redo')
    if (!await clickByLabel('重新读取 ODF')) throw new Error('ODP reload action unavailable')
    await waitFor(`document.querySelector('.n-dialog__content')?.textContent.includes('只在内存草稿中')`, 'reload leave guard')
    await evaluate(`([...document.querySelectorAll('.n-dialog__action button')].find(e=>e.textContent.includes('继续编辑')))?.click()`)
    await waitFor(`document.querySelector('[data-testid="m5-3-odp-text-editor"]')?.value===${JSON.stringify(testCase.replacement)}`, 'draft retained after leave cancel')
    await capture('odp-wide-draft.jpg')
    await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 720, deviceScaleFactor: 1, mobile: false })
    await delay(400)
    await evaluate(`document.querySelector('.odp-edit-panel')?.scrollIntoView({block:'start'})`)
    await delay(250)
    const narrowStable = await evaluate(`(() => { const root=document.querySelector('.odf-workspace');const panel=document.querySelector('.odp-edit-panel');const toolbar=document.querySelector('.toolbar');return !!root&&!!panel&&!!toolbar&&root.scrollWidth<=root.clientWidth+1&&panel.getBoundingClientRect().right<=root.getBoundingClientRect().right+1&&toolbar.getBoundingClientRect().right<=root.getBoundingClientRect().right+1 })()`)
    if (!narrowStable) throw new Error('M5-3 narrow ODP workspace overflowed')
    await capture('odp-narrow-draft.jpg')
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
  }

  if (!await clickByLabel('可靠另存 ODP 副本')) throw new Error(`${testCase.producer} save action unavailable`)
  await waitFor(`document.querySelector('.n-dialog__action')`, `${testCase.producer} save prompt`)
  await evaluate(`(() => { const e=document.querySelector('.n-dialog input');if(!(e instanceof HTMLInputElement))return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(path.basename(target))});e.dispatchEvent(new Event('input',{bubbles:true}));return true })()`)
  await evaluate(`([...document.querySelectorAll('.n-dialog__action button')].find(e=>e.textContent.includes('保存副本')))?.click()`)
  await waitFor(`location.hash.includes(${JSON.stringify(path.basename(target))}) && document.querySelector('.slide')?.textContent.includes(${JSON.stringify(testCase.replacement)})`, `${testCase.producer} saved copy reopen`)
  if (await digest(source) !== sourceBefore) throw new Error(`${testCase.producer} source changed after save`)
  results.push({ producer: testCase.producer, original: testCase.original, replacement: testCase.replacement, initialText, sourceBeforeSha256: sourceBefore, sourceAfterSha256: await digest(source), targetSha256: await digest(target), targetBytes: (await fs.stat(target)).size, uiReopened: true })
}

await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(complexSource)})`)
await waitFor(`document.querySelector('[data-testid="m5-3-odp-blocked-slide"]') && !document.querySelector('[data-testid="m5-3-odp-edit-banner"]')`, 'complex slide whole-page blocker')
const blockedText = await evaluate(`document.querySelector('[data-testid="m5-3-odp-blocked-slide"]')?.textContent?.trim() || ''`)
if (!blockedText.includes('整体保持只读') || !blockedText.includes('自定义形状') || !blockedText.includes('本页全部正文保持只读')) throw new Error(`complex blocker explanation missing: ${blockedText}`)
await capture('odp-complex-blocked.jpg')
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)
await fs.writeFile(bridge, `${JSON.stringify({ results, undoRedo: true, reloadLeaveGuard: true, responsive720x720: true, complexWholeSlideBlocked: true, blockedText, runtimeErrors: 0 }, null, 2)}\n`)
socket.close()
console.log('M5-3 real Tauri ODP workspace flow passed')
