import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { getDocument, PDFDataRangeTransport } from 'pdfjs-dist/legacy/build/pdf.mjs'

const source = fs.readFileSync(new URL('../src-tauri/src/commands/index.rs', import.meta.url), 'utf8')
const encoded = source.match(/const TWO_PAGE_PDF: &str = "([A-Za-z0-9+/=]+)";/)?.[1]
if (!encoded) throw new Error('PDF benchmark fixture not found')

const base = Buffer.from(encoded, 'base64')
const targetBytes = 100 * 1024 * 1024
const payloadSize = targetBytes - base.length - 256
const objectOffset = base.length
const prefix = Buffer.from(`\n10 0 obj\n<< /Length ${payloadSize} >>\nstream\n`)
const payload = Buffer.alloc(payloadSize, 65)
const suffix = Buffer.from('\nendstream\nendobj\n')
const xrefOffset = base.length + prefix.length + payload.length + suffix.length
const tail = Buffer.from(`xref\n10 1\n${String(objectOffset).padStart(10, '0')} 00000 n \ntrailer\n<< /Size 11 /Root 5 0 R /Prev 1264 >>\nstartxref\n${xrefOffset}\n%%EOF\n`)
const buffer = Buffer.concat([base, prefix, payload, suffix, tail])
const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
let requestedBytes = 0
let requestCount = 0

class MemoryRangeTransport extends PDFDataRangeTransport {
  constructor() {
    super(data.length, data.slice(0, 256 * 1024), true, '100mb-fixture.pdf')
  }

  requestDataRange(begin, end) {
    requestedBytes += end - begin
    requestCount++
    this.onDataRange(begin, data.slice(begin, end))
  }
}

const started = performance.now()
const task = getDocument({
  range: new MemoryRangeTransport(),
  rangeChunkSize: 256 * 1024,
  disableStream: true,
  disableAutoFetch: true,
  verbosity: 0,
})
const document = await task.promise
const page = await document.getPage(1)
const content = await page.getTextContent()
const text = content.items.map(item => 'str' in item ? item.str : '').join(' ')
const elapsedMs = Math.round(performance.now() - started)
await task.destroy()

if (document.numPages !== 2 || !text.includes('Knowledge Graph Alpha')) {
  throw new Error('100 MB range fixture did not render the expected first page')
}
if (elapsedMs >= 2_000) {
  throw new Error(`100 MB first-page benchmark exceeded 2 seconds: ${elapsedMs} ms`)
}

console.log(JSON.stringify({
  fileMiB: Number((data.length / 1024 / 1024).toFixed(2)),
  elapsedMs,
  requestedKiB: Number((requestedBytes / 1024).toFixed(1)),
  requestCount,
}))
