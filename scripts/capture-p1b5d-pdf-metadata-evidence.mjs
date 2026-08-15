import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14530'
const output = path.resolve(process.env.LONGEDIT_P1B5D_OUTPUT || 'docs/evidence/p1b5d-pdf-metadata')
const library = process.env.LONGEDIT_P1B5D_LIBRARY
const sourcePath = process.env.LONGEDIT_P1B5D_SOURCE
const sourceCommit = process.env.LONGEDIT_P1B5D_SOURCE_COMMIT
if (!library || !sourcePath || !sourceCommit) throw new Error('P1-B5D audit environment is incomplete')
const targetPath = path.join(library, 'P1B5D Metadata Evidence-文档属性.pdf')
const requested = {
  title: '知识图谱专业管理 P1B5D',
  author: 'LongEdit 证据审计',
  subject: '',
  keywords: '知识管理, PDF, 元数据, P1B5D',
}
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
  const diagnostic = await evaluate(`({href:location.href,body:document.body?.innerText?.slice(0,2400)})`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(diagnostic)}`)
}
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const metrics = () => evaluate(`(() => {
  const panel=document.querySelector('[data-testid="p1b5c-pdf-metadata"]');
  const bounds=panel?.getBoundingClientRect();
  const text=panel?.textContent||'';
  const value=label=>panel?.querySelector('[aria-label="'+label+'"]')?.value||'';
  return {
    viewport:[innerWidth,innerHeight],
    overflow:document.documentElement.scrollWidth-innerWidth,
    panel:bounds&&{width:Math.round(bounds.width),height:Math.round(bounds.height)},
    integrated:Boolean(panel?.closest('.pdf-sidebar')&&panel?.closest('.pdf-view')&&document.querySelector('.pdf-scroll')),
    values:{title:value('PDF 文档标题'),author:value('PDF 文档作者'),subject:value('PDF 文档主题'),keywords:value('PDF 文档关键词')},
    draftBadge:document.querySelector('.page-plan-dirty')?.textContent||'',
    verified:text.includes('属性新副本验证通过')&&text.includes('保留属性已复读'),
    scopeVisible:text.includes('不是隐私清理')&&text.includes('不代表匿名化'),
    saveReachable:[...(panel?.querySelectorAll('button')||[])].some(button=>button.textContent?.includes('另存属性副本')),
    errorVisible:Boolean(panel?.querySelector('[data-kind="error"],[role="alert"]'))
  }
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`Boolean(window.__TAURI_INTERNALS__) && document.readyState !== 'loading'`, 'Tauri runtime')
await waitFor(`document.body?.innerText?.includes('P1B5D Metadata Evidence.pdf')`, 'library fixture registration')
await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(sourcePath)})`)
await waitFor(`document.querySelector('.pdf-scroll [data-pdf-page="1"] canvas')?.width > 100`, 'source PDF canvas render')
await evaluate(`([...document.querySelectorAll('button')].find(button=>(button.textContent||'').trim()==='文档属性')).click()`)
await waitFor(`document.querySelector('[aria-label="PDF 文档标题"]')?.value==='Legacy Knowledge Base'`, 'existing metadata baseline')
await evaluate(`(async () => {
  const set=(label,value)=>{const input=document.querySelector('[aria-label="'+label+'"]'); const prototype=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; const descriptor=Object.getOwnPropertyDescriptor(prototype,'value'); descriptor.set.call(input,String(value)); input.dispatchEvent(new Event('input',{bubbles:true}))};
  const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  set('PDF 文档标题',${JSON.stringify(requested.title)}); await settle();
  set('PDF 文档作者',${JSON.stringify(requested.author)}); await settle();
  set('PDF 文档主题',''); await settle();
  set('PDF 文档关键词',${JSON.stringify(requested.keywords)}); await settle();
})()`)
await waitFor(`document.querySelector('.page-plan-dirty')?.textContent?.includes('属性草稿')`, 'metadata draft badge')

await evaluate(`window.__p1b5dConfirm=''; window.confirm=(message)=>{window.__p1b5dConfirm=String(message); return false}`)
await evaluate(`([...document.querySelectorAll('button')].find(button=>(button.textContent||'').trim()==='知识图谱'))?.click()`)
await delay(250)
const draftGuard = await evaluate(`({message:window.__p1b5dConfirm,routeRetained:location.hash.includes('path=')&&Boolean(document.querySelector('[data-testid="p1b5c-pdf-metadata"]'))})`)
const draftWide = await metrics()
await capture('metadata-draft-wide.png')

await evaluate(`([...document.querySelectorAll('[data-testid="p1b5c-pdf-metadata"] button')].find(button=>button.textContent?.includes('验证属性新副本'))).click()`)
await waitFor(`document.querySelector('.metadata-verification')?.textContent?.includes('属性新副本验证通过')`, 'isolated metadata verification')
const verifiedWide = await metrics()
await capture('metadata-verified-wide.png')
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false })
await delay(350)
const verifiedNarrow = await metrics()
await capture('metadata-verified-narrow.png')

await evaluate(`document.querySelector('.metadata-confirm input').click()`)
await evaluate(`document.querySelector('.metadata-save').click()`)
for (let index = 0; index < 500; index += 1) {
  try { await fs.access(targetPath); break } catch { await delay(100) }
}
const targetBytes = await fs.readFile(targetPath)
await waitFor(`document.body?.innerText?.includes('P1B5D Metadata Evidence-文档属性')`, 'saved target route')
await waitFor(`document.querySelector('.pdf-scroll [data-pdf-page="1"] canvas')?.width > 100`, 'saved target reopen')
await evaluate(`([...document.querySelectorAll('button')].find(button=>(button.textContent||'').trim()==='文档属性')).click()`)
await waitFor(`document.querySelector('[aria-label="PDF 文档标题"]')?.value===${JSON.stringify(requested.title)}`, 'saved metadata reopen')
const reopened = await evaluate(`(() => {
  const panel=document.querySelector('[data-testid="p1b5c-pdf-metadata"]');
  const value=label=>panel?.querySelector('[aria-label="'+label+'"]')?.value||'';
  return {
    route:decodeURIComponent(location.hash),
    pageCount:document.querySelectorAll('.pdf-scroll [data-pdf-page]').length,
    canvasReady:document.querySelector('.pdf-scroll [data-pdf-page="1"] canvas')?.width>100,
    workspace:Boolean(panel?.closest('.pdf-sidebar')&&document.querySelector('.pdf-view')&&document.querySelector('.pdf-scroll')),
    values:{title:value('PDF 文档标题'),author:value('PDF 文档作者'),subject:value('PDF 文档主题'),keywords:value('PDF 文档关键词')},
    errorVisible:Boolean(panel?.querySelector('[data-kind="error"],[role="alert"]'))
  }
})()`)
await capture('metadata-saved-reopened.png')

const sourceAfter = await fs.readFile(sourcePath)
const sourceUnchanged = Buffer.compare(sourceBefore, sourceAfter) === 0
const targetDigest = crypto.createHash('sha256').update(targetBytes).digest('hex')
const matches = value => JSON.stringify(value.values) === JSON.stringify(requested)
const draftResponsive = value => value.integrated && matches(value) && value.draftBadge.includes('属性草稿') && !value.verified && !value.errorVisible && value.overflow <= 2 && value.panel?.width >= 280
const verifiedResponsive = value => value.integrated && matches(value) && value.verified && value.scopeVisible && value.saveReachable && !value.errorVisible && value.overflow <= 2 && value.panel?.width >= 280
const passed = draftResponsive(draftWide) && verifiedResponsive(verifiedWide) && verifiedResponsive(verifiedNarrow) && draftGuard.routeRetained && draftGuard.message.includes('文档属性修改') && sourceUnchanged && reopened.pageCount === 2 && reopened.canvasReady && reopened.workspace && matches(reopened) && !reopened.errorVisible && runtimeErrors.length === 0
if (!passed) throw new Error(`P1-B5D desktop gate failed: ${JSON.stringify({ draftWide, verifiedWide, verifiedNarrow, draftGuard, sourceUnchanged, reopened, runtimeErrors })}`)

await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  stage: 'P1-B5D',
  sourceCommit,
  requested,
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
}, null, 2)}\n`)
socket.close()
console.log('P1-B5D PDF metadata desktop capture passed.')
