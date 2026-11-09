import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Read-only verification of the separate deterministic provider test. Never
// auto-select a device or clear application data.
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, args) => {
  if (index % 2 === 0) pairs.push([value.replace(/^--/, ''), args[index + 1]])
  return pairs
}, []))
assert.ok(options.serial && options['recovery-id'] && options['export-path'] && options.output,
  'Required: --serial --recovery-id --export-path --output')
assert.match(options['recovery-id'], /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
const adb = options.adb || 'E:/Android/Sdk/platform-tools/adb.exe'
function command(...args) {
  const result = spawnSync(adb, ['-s', options.serial, ...args], { maxBuffer: 8 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr?.toString() || 'ADB read failed')
  return result.stdout
}
const app = 'com.longyuye.mdreader.mobile.dev'
const readPrivate = file => command('exec-out', 'run-as', app, 'cat', file)
const recordBytes = readPrivate(`files/write-recovery/${options['recovery-id']}.json`)
const record = JSON.parse(recordBytes.toString('utf8'))
const original = command('exec-out', 'run-as', 'com.longyuye.mdreader.storagefixture', 'cat', 'files/unconfirmed.md')
assert.equal(original.toString('utf8'), record.original, 'Provider original must remain byte-identical')
const exportedBytes = command('exec-out', 'cat', options['export-path'])
const exported = JSON.parse(exportedBytes.toString('utf8'))
assert.equal(exported.format, 'longedit-write-recovery'); assert.equal(exported.version, 1)
assert.equal(exported.original, record.original); assert.equal(exported.candidate, record.candidate)
assert.equal(exported.id, options['recovery-id'])
const draftId = createHash('sha256').update(`${record.rootId}\n${record.relativePath}`).digest('hex')
const draft = JSON.parse(readPrivate(`files/drafts-v1/${draftId}.json`).toString('utf8'))
assert.equal(draft.content, record.candidate, 'Revoked source draft must remain protected')
const filenames = command('exec-out', 'run-as', app, 'ls', 'files/library').toString('utf8').trim().split(/\r?\n/)
const copies = filenames.filter(name => /^(provider-note-副本-|原文恢复-|草稿恢复-)/.test(name))
const contents = copies.map(name => ({ name, content: readPrivate(`files/library/${name}`).toString('utf8') }))
assert.ok(contents.some(copy => copy.content === record.original), 'Original copy missing')
assert.ok(contents.some(copy => copy.content === record.candidate), 'Candidate copy missing')
assert.ok(contents.some(copy => copy.name.startsWith('草稿恢复-') && copy.content === record.candidate), 'Recovery center candidate copy missing')
let readonlyOriginal
if (options['readonly-marker']) {
  readonlyOriginal = command('exec-out', 'run-as', 'com.longyuye.mdreader.storagefixture', 'cat', 'files/readonly.md')
  assert.equal(readonlyOriginal.toString('utf8'), record.original, 'Read-only provider original must remain unchanged')
  assert.ok(contents.some(copy => copy.content.includes(options['readonly-marker'])), 'Read-only edit copy missing')
}
await mkdir(options.output, { recursive: true })
await Promise.all([
  writeFile(path.join(options.output, 'provider-original.md'), original),
  writeFile(path.join(options.output, 'write-journal.json'), recordBytes),
  writeFile(path.join(options.output, 'exported-recovery.json'), exportedBytes),
  ...(readonlyOriginal ? [writeFile(path.join(options.output, 'readonly-original.md'), readonlyOriginal)] : []),
])
const report = {
  kind: 'android-documents-provider-fixture-byte-verification', serial: options.serial,
  checkedAt: new Date().toISOString(), recoveryId: options['recovery-id'], passed: true,
  checks: ['provider original unchanged', 'journal retains both versions', 'export JSON equals journal versions',
    'revoked source private draft retained', 'original and candidate copies exist in internal library',
    ...(readonlyOriginal ? ['read-only source unchanged and edit copied to internal library'] : [])],
  copies: contents.map(({ name, content }) => ({ name, sha256: createHash('sha256').update(content).digest('hex') })),
  limitations: ['deterministic test provider, not a real cloud service', 'does not simulate device power loss', 'UI tasks recorded separately'],
}
await writeFile(path.join(options.output, 'byte-verification.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
