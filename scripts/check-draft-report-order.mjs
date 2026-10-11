import assert from 'node:assert/strict'
import { createSerialDraftReporter } from '../src/utils/serialDraftReports.ts'

const seen = []
let release
const gate = new Promise(resolve => { release = resolve })
const send = createSerialDraftReporter(async report => {
  seen.push({ ...report })
  if (report.sequence === 1) await gate
  if (report.sequence === 2) throw new Error('simulated IPC failure')
})
const source = { session: 'page-1', sequence: 1, dirty: true }
const first = send(source)
source.dirty = false
const second = send({ session: 'page-1', sequence: 2, dirty: true })
const rejected = assert.rejects(second, /simulated IPC failure/)
const third = send({ session: 'page-1', sequence: 3, dirty: false })
await Promise.resolve()
assert.deepEqual(seen, [{ session: 'page-1', sequence: 1, dirty: true }])
release()
await first
await rejected
await third
assert.deepEqual(seen.map(report => [report.sequence, report.dirty]), [[1, true], [2, true], [3, false]])
console.log('PASS: ordered transitions, captured values, and progress after IPC failure')
