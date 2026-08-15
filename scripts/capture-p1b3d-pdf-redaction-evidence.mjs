import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14519'
const output = path.resolve(process.env.LONGEDIT_P1B3D_OUTPUT || 'docs/evidence/p1b3d-pdf-redaction')
const library = process.env.LONGEDIT_P1B3D_LIBRARY
const sourcePath = process.env.LONGEDIT_P1B3D_SOURCE
const sourceCommit = process.env.LONGEDIT_P1B3D_SOURCE_COMMIT
if (!library || !sourcePath || !sourceCommit) throw new Error('P1-B3D audit environment is incomplete')
const targetPath = path.join(library, 'P1B3D Redaction Evidence-永久脱敏.pdf')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const sourceBefore = await fs.readFile(sourcePath)
const sourceDigest = crypto.createHash('sha256').update(sourceBefore).digest('hex')

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
const waitFor = async (expression, description) => {
  for (let index = 0; index < 600; index += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const diagnostic = await evaluate(`({href:location.href,body:document.body?.innerText?.slice(0,2200)})`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(diagnostic)}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const metrics = () => evaluate(`(() => {
  const panel=document.querySelector('[data-testid="p1b3c-pdf-redaction"]');
  const bounds=panel?.getBoundingClientRect();
  const text=panel?.textContent||'';
  return {
    viewport:[innerWidth,innerHeight],
    overflow:document.documentElement.scrollWidth-innerWidth,
    panel:bounds&&{width:Math.round(bounds.width),height:Math.round(bounds.height)},
    integrated:Boolean(panel?.closest('.pdf-sidebar')&&panel?.closest('.pdf-view')&&document.querySelector('.pdf-scroll')),
    redactionCount:panel?.querySelectorAll('.redaction-list > button').length||0,
    verified:text.includes('图片型脱敏副本验证通过')&&text.includes('文字提取为空'),
    tradeoffVisible:text.includes('失去文字、表单、链接、批注'),
    saveReachable:[...(panel?.querySelectorAll('button')||[])].some(button=>button.textContent?.includes('另存永久脱敏副本')),
    errorVisible:Boolean(panel?.querySelector('[data-kind="error"],[role="alert"]'))
  }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`Boolean(window.__TAURI_INTERNALS__) && document.readyState !== 'loading'`, 'Tauri runtime')
await waitFor(`document.body?.innerText?.includes('P1B3D Redaction Evidence.pdf')`, 'library fixture registration')
await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(sourcePath)})`)
await waitFor(`document.querySelector('.pdf-scroll [data-pdf-page="1"] canvas')?.width > 100`, 'source PDF canvas render')
await delay(500)
await evaluate(`([...document.querySelectorAll('button')].find(button=>(button.textContent||'').trim()==='永久脱敏')).click()`)
await waitFor(`document.querySelector('[data-testid="p1b3c-pdf-redaction"]')`, 'redaction panel')
await evaluate(`([...document.querySelectorAll('[data-testid="p1b3c-pdf-redaction"] button')].find(button=>button.textContent?.includes('开始框选'))).click()`)
await waitFor(`document.querySelector('.pdf-scroll [data-pdf-page="1"] .redaction-capture')`, 'redaction capture layer')
const pageBounds = await evaluate(`(() => { const r=document.querySelector('.pdf-scroll [data-pdf-page="1"] .redaction-capture').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height} })()`)
const start = { x: pageBounds.x + pageBounds.width * 0.07, y: pageBounds.y + pageBounds.height * 0.21 }
const end = { x: pageBounds.x + pageBounds.width * 0.90, y: pageBounds.y + pageBounds.height * 0.32 }
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y })
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: end.x, y: end.y, button: 'left', buttons: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1 })
await waitFor(`document.querySelectorAll('.redaction-list > button').length===1`, 'redaction draft')

await evaluate(`window.__p1b3dConfirm=''; window.confirm=(message)=>{window.__p1b3dConfirm=String(message); return false}`)
await evaluate(`([...document.querySelectorAll('button')].find(button=>(button.textContent||'').trim()==='知识图谱'))?.click()`)
await delay(250)
const draftGuard = await evaluate(`({message:window.__p1b3dConfirm,routeRetained:location.hash.includes('path=')&&Boolean(document.querySelector('[data-testid="p1b3c-pdf-redaction"]'))})`)
const draftWide = await metrics()
await capture('redaction-draft-wide.png')

await evaluate(`([...document.querySelectorAll('[data-testid="p1b3c-pdf-redaction"] button')].find(button=>button.textContent?.includes('生成并验证'))).click()`)
await waitFor(`document.querySelector('.redaction-verification')?.textContent?.includes('图片型脱敏副本验证通过')`, 'isolated redaction verification')
const verifiedWide = await metrics()
await capture('redaction-verified-wide.png')
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false })
await delay(350)
const verifiedNarrow = await metrics()
await capture('redaction-verified-narrow.png')

await evaluate(`document.querySelector('.redaction-confirm input').click()`)
await evaluate(`document.querySelector('.redaction-verification > button').click()`)
for (let index = 0; index < 500; index += 1) {
  try { await fs.access(targetPath); break } catch { await delay(100) }
}
const targetBytes = await fs.readFile(targetPath)
await waitFor(`document.body?.innerText?.includes('P1B3D Redaction Evidence-永久脱敏')`, 'saved target route')
await waitFor(`document.querySelector('.pdf-scroll [data-pdf-page="1"] canvas')?.width > 100`, 'saved target reopen')
await delay(500)
const reopened = await evaluate(`(() => ({
  route:decodeURIComponent(location.hash),
  pageCount:document.querySelectorAll('.pdf-scroll [data-pdf-page]').length,
  canvasReady:document.querySelector('.pdf-scroll [data-pdf-page="1"] canvas')?.width>100,
  workspace:Boolean(document.querySelector('.pdf-view')&&document.querySelector('.pdf-scroll')),
  errorVisible:Boolean(document.querySelector('[data-kind="error"],[role="alert"]'))
}))()`)
await capture('redaction-saved-reopened.png')

const sourceAfter = await fs.readFile(sourcePath)
const sourceUnchanged = Buffer.compare(sourceBefore, sourceAfter) === 0
const targetDigest = crypto.createHash('sha256').update(targetBytes).digest('hex')
const hasSecretBytes = targetBytes.includes(Buffer.from('SECRET-P1B3D-ALPHA-9284'))
const draftResponsive = value => value.integrated && value.redactionCount === 1 && !value.verified && !value.errorVisible && value.overflow <= 2 && value.panel?.width >= 280
const verifiedResponsive = value => value.integrated && value.redactionCount === 1 && value.verified && value.tradeoffVisible && value.saveReachable && !value.errorVisible && value.overflow <= 2 && value.panel?.width >= 280
const passed = draftResponsive(draftWide) && verifiedResponsive(verifiedWide) && verifiedResponsive(verifiedNarrow) && draftGuard.routeRetained && draftGuard.message.includes('永久脱敏框选') && sourceUnchanged && !hasSecretBytes && reopened.pageCount === 2 && reopened.canvasReady && reopened.workspace && !reopened.errorVisible && runtimeErrors.length === 0
if (!passed) throw new Error(`P1-B3D desktop gate failed: ${JSON.stringify({ draftWide, verifiedWide, verifiedNarrow, draftGuard, sourceUnchanged, hasSecretBytes, reopened, runtimeErrors })}`)

const evidence = {
  schemaVersion: 1,
  stage: 'P1-B3D',
  sourceCommit,
  sourceDigest,
  sourceUnchanged,
  targetDigest,
  targetBytes: targetBytes.length,
  targetSecretBytesAbsent: !hasSecretBytes,
  draftGuard,
  draftWide,
  verifiedWide,
  verifiedNarrow,
  reopened,
  runtimeErrorCount: runtimeErrors.length,
  sourceUserContentIncluded: false,
  passed,
}
await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
socket.close()
console.log('P1-B3D PDF redaction desktop capture passed.')
