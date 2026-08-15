import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14520'
const output = path.resolve(process.env.LONGEDIT_P1B4D_OUTPUT || 'docs/evidence/p1b4d-pdf-watermark')
const library = process.env.LONGEDIT_P1B4D_LIBRARY
const sourcePath = process.env.LONGEDIT_P1B4D_SOURCE
const sourceCommit = process.env.LONGEDIT_P1B4D_SOURCE_COMMIT
if (!library || !sourcePath || !sourceCommit) throw new Error('P1-B4D audit environment is incomplete')
const targetPath = path.join(library, 'P1B4D Watermark Evidence-文字水印.pdf')
const watermarkText = '项目机密 P1B4D'
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
  const panel=document.querySelector('[data-testid="p1b4c-pdf-watermark"]');
  const bounds=panel?.getBoundingClientRect();
  const text=panel?.textContent||'';
  return {
    viewport:[innerWidth,innerHeight],
    overflow:document.documentElement.scrollWidth-innerWidth,
    panel:bounds&&{width:Math.round(bounds.width),height:Math.round(bounds.height)},
    integrated:Boolean(panel?.closest('.pdf-sidebar')&&panel?.closest('.pdf-view')&&document.querySelector('.pdf-scroll')),
    inputValue:panel?.querySelector('[aria-label="PDF 水印文字"]')?.value||'',
    verified:text.includes('矢量水印副本验证通过')&&text.includes('页面几何与交互结构已复读'),
    tradeoffVisible:text.includes('可被搜索、提取、编辑或移除')&&text.includes('不能代替永久脱敏'),
    saveReachable:[...(panel?.querySelectorAll('button')||[])].some(button=>button.textContent?.includes('另存水印副本')),
    errorVisible:Boolean(panel?.querySelector('[data-kind="error"],[role="alert"]'))
  }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`Boolean(window.__TAURI_INTERNALS__) && document.readyState !== 'loading'`, 'Tauri runtime')
await waitFor(`document.body?.innerText?.includes('P1B4D Watermark Evidence.pdf')`, 'library fixture registration')
await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(sourcePath)})`)
await waitFor(`document.querySelector('.pdf-scroll [data-pdf-page="1"] canvas')?.width > 100`, 'source PDF canvas render')
await delay(500)
await evaluate(`([...document.querySelectorAll('button')].find(button=>(button.textContent||'').trim()==='文字水印')).click()`)
await waitFor(`document.querySelector('[data-testid="p1b4c-pdf-watermark"]')`, 'watermark panel')
await evaluate(`(async () => {
  const set=(selector,value)=>{const input=document.querySelector(selector); const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); descriptor.set.call(input,String(value)); input.dispatchEvent(new Event('input',{bubbles:true}))};
  const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  set('[aria-label="PDF 水印文字"]',${JSON.stringify(watermarkText)});
  await settle();
  set('[aria-label="PDF 水印角度"]',-33);
  await settle();
  set('[aria-label="PDF 水印透明度"]',0.24);
  await settle();
  set('[aria-label="PDF 水印灰度"]',0.35);
  await settle();
})()`)
await waitFor(`document.querySelector('[aria-label="PDF 水印文字"]')?.value===${JSON.stringify(watermarkText)}`, 'watermark draft')

await evaluate(`window.__p1b4dConfirm=''; window.confirm=(message)=>{window.__p1b4dConfirm=String(message); return false}`)
await evaluate(`([...document.querySelectorAll('button')].find(button=>(button.textContent||'').trim()==='知识图谱'))?.click()`)
await delay(250)
const draftGuard = await evaluate(`({message:window.__p1b4dConfirm,routeRetained:location.hash.includes('path=')&&Boolean(document.querySelector('[data-testid="p1b4c-pdf-watermark"]'))})`)
const draftWide = await metrics()
await capture('watermark-draft-wide.png')

await evaluate(`([...document.querySelectorAll('[data-testid="p1b4c-pdf-watermark"] button')].find(button=>button.textContent?.includes('生成并验证'))).click()`)
await waitFor(`document.querySelector('.watermark-verification')?.textContent?.includes('矢量水印副本验证通过')`, 'isolated watermark verification')
const verifiedWide = await metrics()
await capture('watermark-verified-wide.png')
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false })
await delay(350)
const verifiedNarrow = await metrics()
await capture('watermark-verified-narrow.png')

await evaluate(`document.querySelector('.watermark-confirm input').click()`)
await evaluate(`document.querySelector('.watermark-save').click()`)
for (let index = 0; index < 500; index += 1) {
  try { await fs.access(targetPath); break } catch { await delay(100) }
}
const targetBytes = await fs.readFile(targetPath)
await waitFor(`document.body?.innerText?.includes('P1B4D Watermark Evidence-文字水印')`, 'saved target route')
await waitFor(`document.querySelector('.pdf-scroll [data-pdf-page="1"] canvas')?.width > 100`, 'saved target reopen')
await delay(500)
const reopened = await evaluate(`(() => ({
  route:decodeURIComponent(location.hash),
  pageCount:document.querySelectorAll('.pdf-scroll [data-pdf-page]').length,
  canvasReady:document.querySelector('.pdf-scroll [data-pdf-page="1"] canvas')?.width>100,
  workspace:Boolean(document.querySelector('.pdf-view')&&document.querySelector('.pdf-scroll')),
  errorVisible:Boolean(document.querySelector('[data-kind="error"],[role="alert"]'))
}))()`)
await capture('watermark-saved-reopened.png')

const sourceAfter = await fs.readFile(sourcePath)
const sourceUnchanged = Buffer.compare(sourceBefore, sourceAfter) === 0
const targetDigest = crypto.createHash('sha256').update(targetBytes).digest('hex')
const draftResponsive = value => value.integrated && value.inputValue === watermarkText && !value.verified && !value.errorVisible && value.overflow <= 2 && value.panel?.width >= 280
const verifiedResponsive = value => value.integrated && value.inputValue === watermarkText && value.verified && value.tradeoffVisible && value.saveReachable && !value.errorVisible && value.overflow <= 2 && value.panel?.width >= 280
const passed = draftResponsive(draftWide) && verifiedResponsive(verifiedWide) && verifiedResponsive(verifiedNarrow) && draftGuard.routeRetained && draftGuard.message.includes('文字水印参数') && sourceUnchanged && reopened.pageCount === 2 && reopened.canvasReady && reopened.workspace && !reopened.errorVisible && runtimeErrors.length === 0
if (!passed) throw new Error(`P1-B4D desktop gate failed: ${JSON.stringify({ draftWide, verifiedWide, verifiedNarrow, draftGuard, sourceUnchanged, reopened, runtimeErrors })}`)

const evidence = {
  schemaVersion: 1,
  stage: 'P1-B4D',
  sourceCommit,
  watermarkText,
  watermarkSpec: { angleDegrees: -33, opacity: 0.24, gray: 0.35 },
  sourceDigest,
  sourceUnchanged,
  targetDigest,
  targetBytes: targetBytes.length,
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
console.log('P1-B4D PDF watermark desktop capture passed.')
