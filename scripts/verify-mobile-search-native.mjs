import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args = process.argv.slice(2), options = Object.fromEntries(args.reduce((pairs, value, i) => { if (i % 2 === 0) pairs.push([value.replace(/^--/, ''), args[i + 1]]); return pairs }, []))
assert.ok(options.serial && options['fixture-dir'] && options.output, 'Required: --serial --fixture-dir --output')
const fixtureName = 'LongEdit-Search-20261024', command = (...args) => {
  const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...args], { maxBuffer: 8 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr?.toString() || 'ADB read failed'); return result.stdout
}
const hashes = []
for (const file of ['outline.md', 'nested/detail.txt', 'source-hidden.md', '.hidden/hidden.md', 'sheet.csv', 'not-utf8.txt', 'too-large.md']) {
  const expected = await readFile(path.join(options['fixture-dir'], file === 'outline.md' ? 'updates' : 'source', file))
  const actual = command('exec-out', 'cat', `/sdcard/Documents/${fixtureName}/${file}`)
  assert.deepEqual(actual, expected, `Unexpected source bytes: ${file}`)
  hashes.push({ file, bytes: actual.length, sha256: createHash('sha256').update(actual).digest('hex'), expectedVersion: file === 'outline.md' ? 'explicit external test update' : 'original fixture' })
}
const xml = async file => readFile(path.join(options.output, `${file}.xml`), 'utf8')
const partial = await xml('partial-results')
for (const text of ['部分资料可搜索 · 3 份文档', '2 份 · 部分资料', 'nested/detail.txt', 'outline.md']) assert.ok(partial.includes(text), `Missing initial native search state: ${text}`)
for (const text of ['not-utf8.txt', '当前仅支持 UTF-8 文本', 'too-large.md', '超过单文件 4 MiB']) assert.ok((await xml('read-issues')).includes(text), `Missing native error: ${text}`)
for (const text of ['源码内查找', '1 / 1', '已保存到文件', 'SourceHiddenNeedle']) assert.ok((await xml('source-match')).includes(text), `Missing source match: ${text}`)
assert.ok((await xml('returned-query')).includes('SourceHiddenNeedle'), 'Query and accessibility tree must return after source viewing')
for (const text of ['文件已有变化', '外部更新后的资料', 'UpdatedNativeNeedle']) assert.ok((await xml('changed-file')).includes(text), `Missing refreshed source: ${text}`)
const refreshed = await xml('after-refresh')
assert.ok(refreshed.includes('1 份 · 部分资料') && refreshed.includes('nested/detail.txt'), 'Old source term should now match only the nested file')
const updated = await xml('updated-query')
assert.ok(updated.includes('UpdatedNativeNeedle') && updated.includes('1 份 · 部分资料') && updated.includes('outline.md'), 'New external term must match updated outline')
const revoked = await xml('disconnected-results')
assert.ok(revoked.includes('手机资料库') && revoked.includes('0 份') && !revoked.includes('outline.md'), 'Revoked root cache must not remain in results')
assert.ok((await xml('disconnected-picker')).includes(`${fixtureName} 需要重新授权`), 'Root must be shown as needing authorization')
const permissions = command('shell', 'dumpsys', 'activity', 'permissions').toString('utf8')
const block = permissions.split(/(?=UriPermission\{)/).find(value => value.includes(`/tree/primary%3ADocuments%2F${fixtureName} `))
assert.ok(!block || !/persisted=0x[1-9a-f]/i.test(block), 'Dedicated fixture tree must no longer have persisted URI permission')
const report = { kind: 'android-library-search-byte-and-ui-verification', checkedAt: new Date().toISOString(), serial: options.serial, passed: true, hashes,
  checks: ['nested saved-source search returns two files', 'UTF-8 and 4 MiB errors keep scope explicitly partial', 'source-only match selects 1 of 1 without changing bytes', 'return restores query and accessibility tree', 'stale result opens current source with a warning', 'refresh removes old hit and finds new external text', 'disconnect resets results and revokes persisted fixture-tree permission'],
  limitations: ['UI actions performed separately through ADB and fresh accessibility snapshots', 'ASCII search input; Chinese source bytes verified but Chinese IME composition not tested', 'debug x86_64 emulator only; no physical phone, large real cloud collection or release test'] }
await writeFile(path.join(options.output, 'verification.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2))
