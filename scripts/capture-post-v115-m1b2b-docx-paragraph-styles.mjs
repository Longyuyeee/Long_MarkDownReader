import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const origin = process.env.LONGEDIT_M1B2B_APP_ORIGIN
const output = path.resolve(process.env.LONGEDIT_M1B2B_AUDIT_OUTPUT)
const artifactOutput = process.env.LONGEDIT_M1B2B_ARTIFACT_OUTPUT
  ? path.resolve(process.env.LONGEDIT_M1B2B_ARTIFACT_OUTPUT)
  : ''
const fixtures = JSON.parse(process.env.LONGEDIT_M1B2B_FIXTURES || '[]')
const sourceCommit = process.env.LONGEDIT_M1B2B_SOURCE_COMMIT || ''
if (!endpoint || !origin || fixtures.length !== 3 || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M1B2B desktop environment is incomplete')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const waitForPage = async () => {
  let lastState = 'CDP endpoint not queried'
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/json`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const pages = await response.json()
      const page = pages.find(item => item.type === 'page' && item.url.startsWith(origin) && item.webSocketDebuggerUrl)
      if (page) return page
      lastState = `advertised URLs: ${pages.map(item => item.url).join(', ') || '(none)'}`
    } catch (error) {
      lastState = String(error)
    }
    await delay(250)
  }
  throw new Error(`M1B2B Tauri WebView target missing after 60 seconds: ${lastState}`)
}
const page = await waitForPage()
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
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
  const state = await evaluate(`({ hash: location.hash, text: document.body?.innerText?.slice(0, 1200) })`)
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`)
}
const capture = async file => {
  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(screenshot.data, 'base64'))
}
const clickButton = label => evaluate(`(() => { const label=${JSON.stringify(label)}; const e=[...document.querySelectorAll('button')].find(node=>(node.getAttribute('aria-label')===label||node.getAttribute('data-app-tooltip')===label||node.title===label)&&!node.disabled&&node.offsetParent!==null); if(!(e instanceof HTMLButtonElement))return false;e.click();return true })()`)
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.text || 'exception')
})

await fs.mkdir(output, { recursive: true })
if (artifactOutput) await fs.mkdir(artifactOutput, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode')!==null && !document.querySelector('.page-loader')`, 'library initialization')
const results = []
for (const fixture of fixtures) {
  const before = await digest(fixture.path)
  if (before !== fixture.sha256) throw new Error(`${fixture.id} fixture drifted before desktop test`)
  await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(fixture.path)})`)
  await waitFor(`document.querySelector('.docx-workspace .docx-page')!==null && !document.querySelector('.docx-workspace [role="alert"]')`, `${fixture.id} DOCX load`)
  await waitFor(`!document.querySelector('.n-message')`, `${fixture.id} stale notifications cleared`)
  const opened = await evaluate(`(() => { if(document.querySelector('.docx-editor'))return true; const e=[...document.querySelectorAll('.docx-toolbar button')].find(x=>x.getAttribute('title')?.includes('打开 DOCX 页面编辑')||x.getAttribute('aria-label')?.includes('打开 DOCX 页面编辑')); if(!(e instanceof HTMLButtonElement)||e.disabled)return false;e.click();return true })()`)
  if (!opened) throw new Error(`${fixture.id} editor unavailable`)
  await waitFor(`document.querySelector('.docx-editor')!==null`, `${fixture.id} editor panel`)
  const paragraphMode = await evaluate(`(() => { const e=[...document.querySelectorAll('.edit-mode-tabs button')].find(x=>x.textContent.trim()==='段落'); if(!(e instanceof HTMLButtonElement)||e.disabled)return false;e.click();return true })()`)
  if (!paragraphMode) throw new Error(`${fixture.id} paragraph mode unavailable`)
  await waitFor(`document.querySelector('.edit-mode-tabs button.active')?.textContent.trim()==='段落'`, `${fixture.id} paragraph mode`)
  const selection = await evaluate(`(() => {
    const labels=[...document.querySelectorAll('.docx-editor label.edit-field')]
    const label=labels.find(x=>x.querySelector(':scope > span')?.textContent.trim()==='段落样式')
    const select=label?.querySelector('select')
    if(!(select instanceof HTMLSelectElement))return null
    const before=select.value
    const option=[...select.options].find(item=>item.value!==before)
    if(!option)return null
    select.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))
    select.focus()
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,option.value)
    select.dispatchEvent(new Event('change',{bubbles:true}))
    return {before,after:option.value,label:option.textContent.trim(),optionCount:select.options.length}
  })()`)
  if (!selection || selection.before === selection.after || selection.optionCount < 2) throw new Error(`${fixture.id} style selection failed`)
  await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim()==='1/32'`, `${fixture.id} draft`)
  if (await digest(fixture.path) !== before) throw new Error(`${fixture.id} source changed before explicit save`)
  await waitFor(`[...document.querySelectorAll('button')].some(e=>(e.getAttribute('aria-label')==='撤销草稿修改'||e.getAttribute('data-app-tooltip')==='撤销草稿修改'||e.title==='撤销草稿修改')&&!e.disabled&&e.offsetParent!==null)`, `${fixture.id} undo enabled`)
  if (!await clickButton('撤销草稿修改')) throw new Error(`${fixture.id} undo unavailable`)
  await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim()==='0/32'`, `${fixture.id} undo`)
  if (await digest(fixture.path) !== before) throw new Error(`${fixture.id} source changed after undo`)
  if (!await clickButton('重做草稿修改')) throw new Error(`${fixture.id} redo unavailable`)
  await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim()==='1/32'`, `${fixture.id} redo`)
  const verify = await evaluate(`(() => { const e=document.querySelector('.docx-editor .verify-edit');if(!(e instanceof HTMLButtonElement)||e.disabled)return false;e.click();return true })()`)
  if (!verify) throw new Error(`${fixture.id} verify unavailable`)
  await waitFor(`document.querySelector('.edit-verification:not(.error)')?.textContent.includes('隔离验证通过')===true`, `${fixture.id} isolated verification`)
  if (await digest(fixture.path) !== before) throw new Error(`${fixture.id} source changed during verification`)
  await capture(`${fixture.id}-paragraph-style-draft.jpg`)
  const save = await evaluate(`(() => { const e=[...document.querySelectorAll('.copy-save button')].find(x=>x.textContent.includes('保存到原文件'));if(!(e instanceof HTMLButtonElement)||e.disabled)return false;e.click();return true })()`)
  if (!save) throw new Error(`${fixture.id} save unavailable`)
  await waitFor(`document.querySelector('.n-dialog__action')!==null`, `${fixture.id} save confirmation`)
  await evaluate(`([...document.querySelectorAll('.n-dialog__action button')].find(e=>e.textContent.includes('保存到原文件')))?.click()`)
  await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim()==='0/32'`, `${fixture.id} saved reopen`)
  const after = await digest(fixture.path)
  if (after === before) throw new Error(`${fixture.id} source digest did not change after save`)
  if (artifactOutput) await fs.copyFile(fixture.path, path.join(artifactOutput, `${fixture.id}-longedit.docx`))
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false })
  await delay(250)
  const responsive = await evaluate(`(()=>{const e=document.querySelector('.docx-workspace');return !!e&&e.scrollWidth<=e.clientWidth+1&&document.querySelector('.edit-mode-tabs button')?.getBoundingClientRect().width>0})()`)
  if (!responsive) throw new Error(`${fixture.id} 960x720 layout overflow`)
  results.push({ producerId: fixture.id, beforeSha256: before, afterSha256: after, selectedStyle: selection, draftSourceUnchanged: true, undoRedo: true, isolatedPreview: true, explicitSave: true, savedReopen: true, responsive960x720: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
}
if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(' | ')}`)
const evidence = { schemaVersion: 1, stage: 'M1B2B', status: 'passed', sourceCommit, expected: { realProducerFiles: 3, sourceUnchangedBeforeSave: true, undoRedo: true, isolatedPreview: true, explicitSave: true, savedReopen: true, responsive960x720: true, runtimeErrors: 0 }, actual: { results, runtimeErrors: 0 }, evidenceFiles: results.map(result => `${result.producerId}-paragraph-style-draft.jpg`), sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'desktop-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log('M1B2B real Tauri desktop audit passed for Word, WPS and LibreOffice DOCX')
