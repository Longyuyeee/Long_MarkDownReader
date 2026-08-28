import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14532'
const output = path.resolve(process.env.LONGEDIT_M4C1_AUDIT_OUTPUT || '')
const library = path.resolve(process.env.LONGEDIT_M4C1_AUDIT_LIBRARY || '')
const sourceCommit = process.env.LONGEDIT_M4C1_SOURCE_COMMIT || ''
if (!output || !library || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('M4C-1 audit environment is incomplete')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
let target
for (let attempt = 0; attempt < 180 && !target; attempt += 1) {
  const targets = await fetch(`${endpoint}/json`).then(response => response.json())
  target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools://'))
  if (!target) await delay(100)
}
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView target was not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Unknown runtime exception')
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') runtimeErrors.push(message.params.entry.text || 'Unknown WebView log error')
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
  return response.result.value
}
const invoke = async (command, args = {}) => {
  const result = await evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)}).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))`)
  if (!result?.ok) throw new Error(`${command} failed: ${result?.error || 'unknown error'}`)
  return result.value
}
const waitFor = async (expression, description, attempts = 600) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,2500)})`)
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`)
}
const sha256Bytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const sha256 = async file => sha256Bytes(await fs.readFile(file))
const openManaged = file => evaluate(`location.hash=${JSON.stringify(`#/library?path=${encodeURIComponent(file)}`)}`)
const capture = async file => {
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64'))
}
const clickCreateEntry = async () => {
  const clicked = await evaluate(`(() => { const e = document.querySelector('[data-testid="m4c1-create-table-copy"]'); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`)
  if (!clicked) throw new Error('Cannot click the M4C-1 Table conversion entry')
}
const clickConfirm = async () => {
  const clicked = await evaluate(`(() => { const e = [...document.querySelectorAll('.n-dialog__action button')].find(x => x.textContent?.includes('创建并打开')); if (!(e instanceof HTMLButtonElement) || e.disabled) return false; e.click(); return true })()`)
  if (!clicked) throw new Error('Cannot confirm the M4C-1 Table conversion')
}
const disclosureFacts = async (source, target, format) => {
  const text = await evaluate(`document.querySelector('[data-testid="m4c1-table-conversion-disclosure"]')?.innerText || ''`)
  return {
    complete: text.includes(`来源：${source}`)
      && text.includes(`候选目标：${target}`)
      && text.includes('绝不覆盖来源或已有目标')
      && text.includes('新序号')
      && text.includes('自动打开实际创建的文件')
      && text.includes('转换规则与损失')
      && text.includes('第一行作为列名')
      && text.includes('较短的数据行以空值补齐')
      && text.includes('前 2,000 个非空值推断类型')
      && text.includes('单元格原文仍作为文本值保存')
      && text.includes('新的稳定行列 ID')
      && text.includes('仅初始化一个“表格”视图')
      && text.includes('编码、BOM 和换行格式不会作为 Table JSON 的物理序列化格式保留')
      && text.includes(`原 ${format} 文件保持不变`),
    text,
  }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.library-mode') && !document.querySelector('.page-loader')`, 'Library shell')

const csvPath = path.join(library, 'imports', 'Conversion Matrix.csv')
const tsvPath = path.join(library, 'imports', 'Conversion Outline.tsv')
const initialHashes = { csv: await sha256(csvPath), tsv: await sha256(tsvPath) }

await openManaged(csvPath)
await waitFor(`document.querySelector('.table-view') && document.querySelector('[data-testid="m4c1-create-table-copy"]') && !document.querySelector('.table-state')`, 'CSV conversion entry')
await clickCreateEntry()
await waitFor(`document.querySelector('[data-testid="m4c1-table-conversion-disclosure"]')`, 'CSV conversion disclosure')
await delay(350)
const csvDisclosure = await disclosureFacts('imports/Conversion Matrix.csv', 'imports/Conversion Matrix.table.json', 'CSV')
const responsive1280 = await evaluate(`(() => { const e = document.querySelector('.table-view'); const d = document.querySelector('.n-dialog'); return Boolean(e && e.scrollWidth <= e.clientWidth + 1 && d && d.getBoundingClientRect().right <= innerWidth && d.getBoundingClientRect().bottom <= innerHeight) })()`)
await capture('csv-disclosure-1280.jpg')
await clickConfirm()
await waitFor(`document.querySelector('.table-view') && document.body.innerText.includes('开放 Table') && document.querySelector('.table-title strong')?.textContent?.trim() === 'Conversion Matrix.table.json'`, 'automatically opened CSV Table target', 900)
const csvAutoOpenedActualTarget = await evaluate(`document.querySelector('.table-title strong')?.textContent?.trim() === 'Conversion Matrix.table.json'`)
await waitFor(`!document.querySelector('.n-dialog')`, 'CSV confirmation departure')
const successDialogObservedAfterCsv = await evaluate(`Boolean(document.querySelector('.n-dialog__action'))`)
await capture('csv-auto-opened-target-1280.jpg')
const csvTargetPath = path.join(library, 'imports', 'Conversion Matrix.table.json')
const csvTarget = await invoke('read_table_file', { libraryRoot: library, path: csvTargetPath })
const csvTargetReread = csvTarget.format === 'longedit-table' && csvTarget.rows?.[0]?.[1] === '001' && csvTarget.rows?.[1]?.[2] === 'false' && csvTarget.columnTypes?.join(',') === 'text,integer,boolean'
const csvTargetJson = JSON.parse(await fs.readFile(csvTargetPath, 'utf8'))
const csvTargetSerializationLossObserved = !('encoding' in csvTargetJson) && !('hasBom' in csvTargetJson) && !('lineEnding' in csvTargetJson)
await waitFor(`!document.querySelector('.n-message')`, 'CSV success notification cleanup')

const tsvFirstTarget = await invoke('import_table_file', { libraryRoot: library, path: tsvPath })
await openManaged(tsvPath)
await waitFor(`document.querySelector('.table-view') && document.querySelector('[data-testid="m4c1-create-table-copy"]') && !document.querySelector('.table-state')`, 'TSV conversion entry')
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 700, deviceScaleFactor: 1, mobile: false })
await clickCreateEntry()
await waitFor(`document.querySelector('[data-testid="m4c1-table-conversion-disclosure"]')`, 'TSV conversion disclosure')
await delay(350)
const tsvDisclosure = await disclosureFacts('imports/Conversion Outline.tsv', 'imports/Conversion Outline.table.json', 'TSV')
const responsive480Geometry = await evaluate(`(() => { const e = document.querySelector('.table-view'); const d = document.querySelector('.n-dialog'); const s = document.querySelector('.table-scroll'); const er = e?.getBoundingClientRect(); const dr = d?.getBoundingClientRect(); return { innerWidth, innerHeight, table: er ? { left: er.left, right: er.right, top: er.top, bottom: er.bottom } : null, dialog: dr ? { left: dr.left, right: dr.right, top: dr.top, bottom: dr.bottom } : null, tableScrollOverflowX: s ? getComputedStyle(s).overflowX : '' } })()`)
const responsive480 = Boolean(responsive480Geometry.table && responsive480Geometry.dialog && responsive480Geometry.table.left >= 0 && responsive480Geometry.table.right <= responsive480Geometry.innerWidth + 1 && responsive480Geometry.table.top >= 0 && responsive480Geometry.table.bottom <= responsive480Geometry.innerHeight + 1 && responsive480Geometry.dialog.left >= 0 && responsive480Geometry.dialog.right <= responsive480Geometry.innerWidth && responsive480Geometry.dialog.top >= 0 && responsive480Geometry.dialog.bottom <= responsive480Geometry.innerHeight && responsive480Geometry.tableScrollOverflowX === 'auto')
await capture('tsv-collision-disclosure-480.jpg')
await clickConfirm()
await waitFor(`document.querySelector('.table-view') && document.querySelector('.table-title strong')?.textContent?.trim() === 'Conversion Outline 1.table.json' && document.body.innerText.includes('导出 CSV') && document.body.innerText.includes('导出 XLSX')`, 'automatically opened numbered TSV Table target', 900)
const tsvAutoOpenedNumberedTarget = await evaluate(`document.querySelector('.table-title strong')?.textContent?.trim() === 'Conversion Outline 1.table.json'`)
await waitFor(`!document.querySelector('.n-dialog')`, 'TSV confirmation departure')
const successDialogObservedAfterTsv = await evaluate(`Boolean(document.querySelector('.n-dialog__action'))`)
await capture('tsv-auto-opened-numbered-target-480.jpg')
const tsvCollisionFile = path.join(library, 'imports', 'Conversion Outline 1.table.json')
const tsvTarget = await invoke('read_table_file', { libraryRoot: library, path: tsvCollisionFile })
const tsvTargetReread = tsvTarget.format === 'longedit-table' && tsvTarget.rows?.[0]?.[1] === '2026-08-29' && tsvTarget.columnTypes?.join(',') === 'text,date'

const finalHashes = { csv: await sha256(csvPath), tsv: await sha256(tsvPath) }
const csvSourceUnchanged = finalHashes.csv === initialHashes.csv
const tsvSourceUnchanged = finalHashes.tsv === initialHashes.tsv
const sourceFilesUnchangedAfterAudit = JSON.stringify(finalHashes) === JSON.stringify(initialHashes)
const blockingErrorSurfaceObserved = await evaluate(`Boolean(document.querySelector('.crash-fallback, .error-boundary'))`)
const actual = {
  csvDisclosureComplete: csvDisclosure.complete,
  tsvDisclosureComplete: tsvDisclosure.complete,
  csvAutoOpenedActualTarget,
  tsvAutoOpenedNumberedTarget,
  csvSourceUnchanged,
  tsvSourceUnchanged,
  csvTargetReread,
  tsvTargetReread,
  csvTargetSerializationLossObserved,
  csvTargetName: path.win32.basename(csvTargetPath),
  tsvFirstTargetName: path.win32.basename(tsvFirstTarget),
  tsvCollisionTargetName: path.win32.basename(tsvCollisionFile),
  csvRows: csvTarget.rows?.length ?? -1,
  csvColumns: csvTarget.headers?.length ?? -1,
  tsvRows: tsvTarget.rows?.length ?? -1,
  tsvColumns: tsvTarget.headers?.length ?? -1,
  successDialogObservedAfterCreate: successDialogObservedAfterCsv || successDialogObservedAfterTsv,
  responsive1280,
  responsive480,
  responsive480Geometry,
  runtimeErrorCount: runtimeErrors.length,
  blockingErrorSurfaceObserved,
  sourceFilesUnchangedAfterAudit,
}
if (!actual.csvDisclosureComplete || !actual.tsvDisclosureComplete || !csvAutoOpenedActualTarget || !tsvAutoOpenedNumberedTarget || !csvSourceUnchanged || !tsvSourceUnchanged || !csvTargetReread || !tsvTargetReread || !csvTargetSerializationLossObserved || actual.csvTargetName !== 'Conversion Matrix.table.json' || actual.tsvFirstTargetName !== 'Conversion Outline.table.json' || actual.tsvCollisionTargetName !== 'Conversion Outline 1.table.json' || actual.csvRows !== 2 || actual.csvColumns !== 3 || actual.tsvRows !== 2 || actual.tsvColumns !== 2 || actual.successDialogObservedAfterCreate || !responsive1280 || !responsive480 || runtimeErrors.length || blockingErrorSurfaceObserved || !sourceFilesUnchangedAfterAudit) throw new Error(`M4C-1 runtime gate failed: ${JSON.stringify(actual)}`)

const evidence = { schemaVersion: 1, stage: 'M4C-1', status: 'passed', sourceCommit, actual, initialHashes, finalHashes, sourceUserContentIncluded: false, releaseCandidate: false }
await fs.writeFile(path.join(output, 'interaction-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
const screenshots = []
for (const file of ['csv-disclosure-1280.jpg', 'csv-auto-opened-target-1280.jpg', 'tsv-collision-disclosure-480.jpg', 'tsv-auto-opened-numbered-target-480.jpg']) {
  const bytes = await fs.readFile(path.join(output, file))
  screenshots.push({ file, bytes: bytes.length, sha256: sha256Bytes(bytes) })
}
const evidenceBytes = await fs.readFile(path.join(output, 'interaction-evidence.json'))
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'M4C-1', status: 'captured-pending-visual-review', sourceCommit, evidenceFile: 'interaction-evidence.json', evidenceSha256: sha256Bytes(evidenceBytes), screenshots, sourceUserContentIncluded: false, releaseCandidate: false }, null, 2)}\n`)
socket.close()
console.log(`M4C-1 CSV/TSV Table conversion audit passed with ${runtimeErrors.length} runtime errors.`)
