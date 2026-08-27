import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const origin = process.env.LONGEDIT_M1B2C_APP_ORIGIN
const output = path.resolve(process.env.LONGEDIT_M1B2C_AUDIT_OUTPUT)
const files = JSON.parse(process.env.LONGEDIT_M1B2C_FILES || '[]')
const sourceCommit = process.env.LONGEDIT_M1B2C_SOURCE_COMMIT || ''
if (!endpoint || !origin || files.length !== 9 || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M1B2C reverse-read environment is incomplete')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const waitForPage = async () => {
  let lastState = 'CDP endpoint not queried'
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const pages = await (await fetch(`${endpoint}/json`)).json()
      const page = pages.find(item => item.type === 'page' && item.url.startsWith(origin) && item.webSocketDebuggerUrl)
      if (page) return page
      lastState = pages.map(item => item.url).join(', ')
    } catch (error) { lastState = String(error) }
    await delay(250)
  }
  throw new Error(`M1B2C Tauri WebView target missing: ${lastState}`)
}
const page = await waitForPage()
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'exception')
  if (!pending.has(message.id)) return
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, label) => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({hash:location.hash,text:document.body?.innerText?.slice(0,1200)})`)
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`)
}
const capture = async file => {
  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(screenshot.data, 'base64'))
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')!==null && !document.querySelector('.page-loader')`, 'library initialization')

const results = []
const capturedProducers = new Set()
for (const fixture of files) {
  const before = await digest(fixture.path)
  if (before !== fixture.sha256) throw new Error(`${fixture.producerId}/${fixture.sourceId} native output digest drifted`)
  await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(fixture.path)})`)
  await waitFor(`document.querySelector('.docx-workspace .docx-page')!==null && !document.querySelector('.docx-workspace [role="alert"]')`, `${fixture.producerId}/${fixture.sourceId} DOCX load`)
  await waitFor(`document.body.innerText.includes(${JSON.stringify(fixture.expectedHeading)})`, `${fixture.producerId}/${fixture.sourceId} heading`)
  const opened = await evaluate(`(() => { if(document.querySelector('.docx-editor'))return true; const e=[...document.querySelectorAll('.docx-toolbar button')].find(x=>x.getAttribute('aria-label')?.includes('打开 DOCX 页面编辑')||x.getAttribute('data-app-tooltip')?.includes('打开 DOCX 页面编辑')||x.title?.includes('打开 DOCX 页面编辑'));if(!(e instanceof HTMLButtonElement)||e.disabled)return false;e.click();return true})()`)
  if (!opened) throw new Error(`${fixture.producerId}/${fixture.sourceId} editor unavailable`)
  await waitFor(`document.querySelector('.docx-editor')!==null`, `${fixture.producerId}/${fixture.sourceId} editor`)
  const paragraphMode = await evaluate(`(()=>{const e=[...document.querySelectorAll('.edit-mode-tabs button')].find(x=>x.textContent.trim()==='段落');if(!(e instanceof HTMLButtonElement)||e.disabled)return false;e.click();return true})()`)
  if (!paragraphMode) throw new Error(`${fixture.producerId}/${fixture.sourceId} paragraph mode unavailable`)
  await waitFor(`document.querySelector('.edit-mode-tabs button.active')?.textContent.trim()==='段落'`, `${fixture.producerId}/${fixture.sourceId} paragraph mode`)
  const style = await evaluate(`(()=>{const label=[...document.querySelectorAll('.docx-editor label.edit-field')].find(x=>x.querySelector(':scope > span')?.textContent.trim()==='段落样式');const select=label?.querySelector('select');if(!(select instanceof HTMLSelectElement))return null;return {value:select.value,label:select.selectedOptions[0]?.textContent.trim()||'',optionCount:select.options.length}})()`)
  if (!style || style.value !== fixture.expectedStyleId || style.optionCount < 2) throw new Error(`${fixture.producerId}/${fixture.sourceId} paragraph style mismatch: ${JSON.stringify(style)}`)
  if (!capturedProducers.has(fixture.producerId)) {
    await capture(`${fixture.producerId}-reverse-read.jpg`)
    capturedProducers.add(fixture.producerId)
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false })
  await delay(200)
  const responsive = await evaluate(`(()=>{const e=document.querySelector('.docx-workspace');return !!e&&e.scrollWidth<=e.clientWidth+1&&document.querySelector('.edit-mode-tabs button')?.getBoundingClientRect().width>0})()`)
  if (!responsive) throw new Error(`${fixture.producerId}/${fixture.sourceId} 960x720 overflow`)
  const after = await digest(fixture.path)
  if (after !== before) throw new Error(`${fixture.producerId}/${fixture.sourceId} changed during LongEdit read`)
  results.push({ producerId: fixture.producerId, sourceId: fixture.sourceId, file: path.basename(fixture.path), sha256: before, expectedHeading: fixture.expectedHeading, expectedStyleId: fixture.expectedStyleId, actualStyle: style, sourceUnchangedAfterRead: true, responsive960x720: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
}
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)
const evidence = { schemaVersion: 1, stage: 'M1B2C-longedit-reverse-read', status: 'passed', sourceCommit, expected: { files: 9, producerSourcePairs: 9, sourceUnchangedAfterRead: true, responsive960x720: true, runtimeErrors: 0 }, actual: { results, runtimeErrors: 0 }, evidenceFiles: [...capturedProducers].map(id => `${id}-reverse-read.jpg`), sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'longedit-reverse-read.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log('M1B2C LongEdit reverse read passed for 9 native producer/source pairs')
