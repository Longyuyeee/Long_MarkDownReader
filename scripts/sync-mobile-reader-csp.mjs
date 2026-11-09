import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const hash = createHash('sha256').update(readFileSync(new URL('../src/mobile/readerBridge.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('base64')
for (const [file, pattern, replacement] of [
  ['../src/mobile/readerDocument.ts', /READER_BRIDGE_HASH = '[^']+'/, `READER_BRIDGE_HASH = '${hash}'`],
  ['../src-tauri/tauri.android.conf.json', /'sha256-[A-Za-z0-9+/=]+'/, `'sha256-${hash}'`],
]) {
  const url = new URL(file, import.meta.url), before = readFileSync(url, 'utf8')
  assert.ok(pattern.test(before), `Missing reader CSP pin: ${file}`)
  const after = before.replace(pattern, replacement)
  if (process.argv.includes('--write')) writeFileSync(url, after)
  else assert.equal(before, after, `Reader changed: run node scripts/sync-mobile-reader-csp.mjs --write`)
}
console.log(`Reader CSP SHA-256: ${hash}`)
