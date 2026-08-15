import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14516'
const output = path.resolve('docs/evidence/p1b2b3-pdf-unicode-form-copy')
const library = process.env.LONGEDIT_PDF_FORM_LIBRARY
const sourcePath = process.env.LONGEDIT_PDF_FORM_SOURCE
const targetPath = path.join(library, 'P1B2B3 Unicode AcroForm-form-filled.pdf')
if (!library || !sourcePath) throw new Error('P1-B2B3 audit paths are missing')
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
  const request = pending.get(message.id); pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value }
const waitFor = async (expression, description) => {
  for (let index = 0; index < 500; index += 1) { if (await evaluate(expression)) return; await delay(100) }
  const diagnostic = await evaluate(`({href:location.href,body:document.body?.innerText?.slice(0,1600),html:document.body?.innerHTML?.slice(0,800)})`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(diagnostic)}`)
}
const capture = async file => { const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }); await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')) }
const metrics = () => evaluate(`(() => { const panel=document.querySelector('[data-testid="p1b2a2-pdf-form-panel"]'); const copy=document.querySelector('[data-testid="p1b2b2-pdf-form-copy"]'); const bounds=panel?.getBoundingClientRect(); const text=copy?.textContent||''; return { viewport:[innerWidth,innerHeight], overflow:document.documentElement.scrollWidth-innerWidth, panel:bounds&&{width:bounds.width,height:bounds.height}, integrated:Boolean(copy?.closest('.pdf-sidebar')&&copy?.closest('.pdf-view')&&document.querySelector('.pdf-scroll')), hasVerified:text.includes('已验证 1 个字段')&&text.includes('1 个外观'), hasNoOverwrite:text.includes('源 PDF 和已有文件不会覆盖'), saveReachable:[...(copy?.querySelectorAll('button')||[])].some(button=>button.textContent?.includes('可靠另存')), errorVisible:Boolean(copy?.querySelector('[data-kind="error"],[role="alert"]')) } })()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await waitFor(`Boolean(window.__TAURI_INTERNALS__) && document.readyState !== 'loading'`, 'Tauri runtime')
await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(sourcePath)})`)
await waitFor(`document.querySelector('.pdf-view .pdf-scroll')`, 'PDF workspace')
await waitFor(`[...document.querySelectorAll('button')].some(button=>(button.innerText||button.textContent||'').includes('表单'))`, 'PDF form action')
const formOpenResult = await evaluate(`(() => { const candidates=[...document.querySelectorAll('button')].filter(button=>(button.innerText||button.textContent||'').trim().startsWith('表单')); const button=candidates.at(-1); if(button)button.click(); return {clicked:Boolean(button),candidates:candidates.map(button=>({text:(button.innerText||button.textContent||'').trim(),role:button.getAttribute('role'),title:button.title,className:button.className}))} })()`)
if (!formOpenResult.clicked) throw new Error(`PDF form action was not found: ${JSON.stringify(formOpenResult)}`)
await waitFor(`document.querySelector('[data-testid="p1b2a2-pdf-form-panel"] .form-text-edit input')`, 'editable text field')
await evaluate(`(() => { const input=document.querySelector('.form-text-edit input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'中文编辑 QA'); input.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
await evaluate(`([...document.querySelectorAll('[data-testid="p1b2b2-pdf-form-copy"] button')].find(button=>button.textContent?.includes('验证副本'))).click()`)
await waitFor(`document.querySelector('[data-testid="p1b2b2-pdf-form-copy"]')?.textContent?.includes('已验证 1 个字段')`, 'isolated verification')
const wide = await metrics(); await capture('pdf-form-copy-wide.png')
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 680, deviceScaleFactor: 1, mobile: false }); await delay(300)
const narrow = await metrics(); await capture('pdf-form-copy-narrow.png')
await evaluate(`([...document.querySelectorAll('[data-testid="p1b2b2-pdf-form-copy"] button')].find(button=>button.textContent?.includes('可靠另存'))).click()`)
for (let index=0; index<300; index+=1) { try { await fs.access(targetPath); break } catch { await delay(100) } }
const targetBytes = await fs.readFile(targetPath)
const reopened = await evaluate(`window.__TAURI_INTERNALS__.invoke('inspect_pdf_form_structure',{libraryRoot:${JSON.stringify(library)},path:${JSON.stringify(targetPath)}})`)
const sourceAfter = await fs.readFile(sourcePath)
const sourceUnchanged = Buffer.compare(sourceBefore, sourceAfter) === 0
const targetField = reopened.fields.find(field => field.name === 'Profile.Name')
const targetWidget = reopened.widgets.find(widget => widget.fieldName === 'Profile.Name')
await evaluate(`location.hash='#/library?path='+encodeURIComponent(${JSON.stringify(targetPath)})`)
await waitFor(`document.querySelector('[data-pdf-page="1"] canvas')?.width > 100`, 'saved PDF canvas render')
await delay(500)
const render = await evaluate(`(() => {
  const canvas=document.querySelector('[data-pdf-page="1"] canvas'); const context=canvas.getContext('2d',{willReadFrequently:true});
  const x1=Math.floor(canvas.width*78/612), x2=Math.floor(canvas.width*314/612), y1=Math.floor(canvas.height*(792-646)/792), y2=Math.floor(canvas.height*(792-624)/792);
  const pixels=context.getImageData(x1,y1,Math.max(1,x2-x1),Math.max(1,y2-y1)).data; let darkPixels=0;
  for(let index=0;index<pixels.length;index+=4) if(pixels[index]<150&&pixels[index+1]<150&&pixels[index+2]<150&&pixels[index+3]>0) darkPixels++;
  return {canvas:[canvas.width,canvas.height],sample:[x1,y1,x2,y2],darkPixels,hasInkInField:darkPixels>20};
})()`)
await capture('unicode-pdf-render.png')
const passed = wide.integrated && wide.hasVerified && wide.hasNoOverwrite && wide.saveReachable && !wide.errorVisible && wide.overflow <= 2 && wide.panel?.width >= 260
  && narrow.integrated && narrow.hasVerified && narrow.hasNoOverwrite && narrow.saveReachable && !narrow.errorVisible && narrow.overflow <= 2 && narrow.panel?.width >= 260
  && targetField?.value === '中文编辑 QA' && targetWidget?.hasNormalAppearance && render.hasInkInField && targetBytes.length < 1_000_000 && sourceUnchanged && runtimeErrors.length === 0
if (!passed) throw new Error(`P1-B2B3 runtime gate failed: ${JSON.stringify({ wide, narrow, reopened, render, targetBytes:targetBytes.length, sourceUnchanged, runtimeErrors })}`)
const evidence = { schemaVersion: 1, stage: 'P1-B2B3', wide, narrow, sourceDigest, sourceUnchanged, targetBytes: targetBytes.length, targetDigest: crypto.createHash('sha256').update(targetBytes).digest('hex'), reopened: { status: reopened.status, fieldValue: targetField.value, hasNormalAppearance: targetWidget.hasNormalAppearance }, render, runtimeErrorCount: runtimeErrors.length, sourceUserContentIncluded: false, passed }
await fs.writeFile(path.join(output, 'runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots=[]
for (const file of ['pdf-form-copy-wide.png','pdf-form-copy-narrow.png','unicode-pdf-render.png']) { const bytes=await fs.readFile(path.join(output,file)); screenshots.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}) }
await fs.writeFile(path.join(output,'manifest.json'),`${JSON.stringify({schemaVersion:1,stage:'P1-B2B3',status:'accepted',screenshots,sourceUserContentIncluded:false},null,2)}\n`)
socket.close()
console.log('P1-B2B3 PDF Unicode form copy desktop capture passed.')
