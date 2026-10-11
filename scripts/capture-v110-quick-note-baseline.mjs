import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT
const output = process.env.LONGEDIT_UX26_OUTPUT
if (!endpoint || !output) throw new Error('Isolated runner environment required')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let target
for (let i = 0; i < 100; i++) {
  try { target = (await fetch(endpoint + '/json').then(r => r.json())).find(t => t.type === 'page') } catch {}
  if (target) break
  await pause(200)
}
if (!target?.webSocketDebuggerUrl) throw new Error('No isolated WebView')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await once(socket, 'open')
let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data)
  const p = pending.get(data.id)
  if (!p) return
  pending.delete(data.id); clearTimeout(p.timer)
  data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')) }, 20000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}
try {
  await send('Page.enable')
  let booted = false
  for (let i = 0; i < 150; i++) {
    if (await evaluate("document.body.innerText.includes('Note.md')")) { booted = true; break }
    await pause(200)
  }
  if (!booted) throw new Error('Isolated library did not initialize: ' + await evaluate('document.body.innerText'))
  await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 300, deviceScaleFactor: 1, mobile: false })
  await evaluate("location.hash='/quick-note'")
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (await evaluate("!!document.querySelector('.quick-note-window textarea')")) { ready = true; break }
    await pause(100)
  }
  if (!ready) throw new Error('QuickNote route not rendered: ' + await evaluate('location.href + document.body.innerText'))
  await pause(500)
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, 'quick-note-before.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  const observed = await evaluate("({text:document.querySelector('.quick-note-window').innerText,textarea:!!document.querySelector('textarea'),viewport:{width:innerWidth,height:innerHeight}})")
  await fs.writeFile(path.join(output, 'observation.json'), JSON.stringify({ scope: 'Debug WebView QuickNote route at 400x300; not tray lifecycle or save verification', observed }, null, 2) + '\n')
  console.log(JSON.stringify(observed))
} finally { socket.close() }
