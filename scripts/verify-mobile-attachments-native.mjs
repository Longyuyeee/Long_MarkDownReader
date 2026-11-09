import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args = process.argv.slice(2), options = Object.fromEntries(args.reduce((pairs, value, i) => { if (i % 2 === 0) pairs.push([value.replace(/^--/, ''), args[i + 1]]); return pairs }, []))
assert.ok(options.serial && options['fixture-dir'] && options.output, 'Required: --serial --fixture-dir --output [--stage before-save|pending-before-restart|pending-after-restart|before-invalid|after-invalid|final]')
const pkg = 'com.longyuye.mdreader.mobile.dev', fixtureName = 'LongEdit-Attachments-20261024', hash = bytes => createHash('sha256').update(bytes).digest('hex')
const command = (...args) => { const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...args], { maxBuffer: 16 * 1024 * 1024 }); assert.equal(result.status, 0, result.stderr?.toString()); return result.stdout }
const privateFile = file => command('exec-out', 'run-as', pkg, 'cat', file)
const prefs = privateFile('shared_prefs/longedit-mobile-roots-v1.xml').toString('utf8')
const root = [...prefs.matchAll(/<string name="([a-f0-9]{64})">([^<]+)<\/string>/g)].find(([, , uri]) => uri.endsWith(fixtureName)); assert.ok(root, 'Dedicated fixture registration missing')
const records = command('exec-out', 'run-as', pkg, 'ls', 'files/image-imports-v1').toString('utf8').trim().split(/\s+/).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)).map(name => JSON.parse(privateFile(`files/image-imports-v1/${name}`)))
const mainFile = () => command('exec-out', 'cat', `/sdcard/Documents/${fixtureName}/Attachment-Note.md`)
const save = async (name, value) => writeFile(path.join(options.output, name), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n')
const stage = options.stage || 'final'
if (stage === 'before-save') {
  const source = mainFile(), original = await readFile(path.join(options['fixture-dir'], 'library/Attachment-Note.md')); assert.deepEqual(source, original)
  const draftId = hash(`${root[1]}\nAttachment-Note.md`), draft = JSON.parse(privateFile(`files/drafts-v1/${draftId}.json`))
  assert.ok(draft.content.includes('attachments/longedit-')); assert.equal(draft.expectedSignature, hash(original))
  await save('original-before-save.md', source); await save('draft-before-save.json', draft); console.log('Native before-save original/draft checks passed')
} else if (stage.startsWith('pending-')) {
  const pending = records.find(record => record.rootId === root[1] && record.notePath === 'blocked/Conflict-Note.md' && record.status === 'unconfirmed'); assert.ok(pending)
  const candidate = privateFile(`files/image-imports-v1/${pending.id}.bin`), expected = await readFile(path.join(options['fixture-dir'], 'picker/diagram.png')); assert.deepEqual(candidate, expected)
  const note = command('exec-out', 'cat', `/sdcard/Documents/${fixtureName}/blocked/Conflict-Note.md`); assert.deepEqual(note, await readFile(path.join(options['fixture-dir'], 'library/blocked/Conflict-Note.md')))
  await save(`${stage}.json`, { record: pending, candidateSha256: hash(candidate), candidateBytes: candidate.length, originalNoteSha256: hash(note) }); console.log(`${stage}: native candidate and original checks passed`)
} else if (stage.endsWith('-invalid')) {
  const snapshot = { recordIds: records.map(record => record.id).sort(), mainSha256: hash(mainFile()) }
  if (stage === 'after-invalid') assert.deepEqual(snapshot, JSON.parse(await readFile(path.join(options.output, 'before-invalid.json'), 'utf8')))
  await save(`${stage}.json`, snapshot); console.log(`${stage}: native record/source snapshot checked`)
} else {
  const hashes = [], relevant = records.filter(record => record.rootId === root[1] || record.rootId === 'local' && record.notePath.startsWith('Attachment-Note-副本-'))
  assert.ok(relevant.length >= 7); assert.ok(relevant.every(record => record.status === 'ready'))
  for (const record of relevant) {
    assert.ok(!record.imagePath.split('/').some(part => !part || part === '..' || part === '.' || /[\\\0]/.test(part)))
    const expectedName = { 'image/png': 'diagram.png', 'image/jpeg': 'photo.jpg', 'image/webp': 'sample.webp' }[record.mime]; assert.ok(expectedName)
    const actual = record.rootId === 'local' ? privateFile(`files/library/${record.imagePath}`) : command('exec-out', 'cat', `/sdcard/Documents/${fixtureName}/${record.imagePath}`)
    assert.deepEqual(actual, await readFile(path.join(options['fixture-dir'], 'picker', expectedName))); assert.equal(hash(actual), record.signature)
    assert.equal(record.width, 320); assert.equal(record.height, 200)
    hashes.push({ id: record.id, note: record.notePath, mime: record.mime, bytes: actual.length, sha256: hash(actual), imagePath: record.imagePath })
  }
  const main = mainFile().toString('utf8'); assert.ok(main.startsWith('# 附件操作验收\r\n') && main.includes('NativeOriginalBody') && !main.includes('missing.png'))
  assert.ok(!main.replace(/\r\n/g, '').includes('\n'), 'Native CRLF source must not acquire mixed line endings')
  const copies = relevant.filter(record => record.rootId === 'local'), copyNames = [...new Set(copies.map(record => record.notePath))]; assert.equal(copyNames.length, 1); assert.equal(copies.length, 3)
  const copy = privateFile(`files/library/${copyNames[0]}`).toString('utf8'); assert.ok(copy.includes('NativeOriginalBody'))
  for (const record of copies) assert.ok(copy.includes(record.imagePath)); assert.notEqual(main, copy)
  const before = JSON.parse(await readFile(path.join(options.output, 'pending-before-restart.json'), 'utf8')), after = JSON.parse(await readFile(path.join(options.output, 'pending-after-restart.json'), 'utf8'))
  assert.equal(before.record.id, after.record.id); assert.equal(before.candidateSha256, after.candidateSha256)
  const folderFailure = JSON.parse(await readFile(path.join(options.output, 'retry-before-folder-fix.json'), 'utf8'))
  assert.equal(folderFailure.id, before.record.id); assert.equal(folderFailure.attempts, 2)
  assert.equal(relevant.find(record => record.id === before.record.id).attempts, 3)
  const threeFormats = await readFile(path.join(options.output, 'three-formats-lower.xml'), 'utf8')
  for (const alt of ['丢失图片', 'sample', 'diagram']) assert.ok(threeFormats.includes(`text="${alt}"`))
  assert.ok(!threeFormats.includes('张图片未加载'))
  const returned = await readFile(path.join(options.output, 'return-library-focus.xml'), 'utf8')
  assert.ok(/text="资料"[^>]*focused="true"/.test(returned), 'Library return must restore a real accessible navigation focus')
  for (const [file, text] of [['invalid-type.xml', '图片内容无法识别'], ['invalid-bytes.xml', '图片支持 2 MiB'], ['invalid-pixels.xml', '图片分辨率超过当前阅读限制'], ['portable-copy.xml', 'NativeOriginalBody']]) {
    const xml = await readFile(path.join(options.output, file), 'utf8'); assert.ok(xml.includes(text), `${file}: response missing`)
    if (file.startsWith('invalid-')) {
      const node = [...xml.matchAll(/text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)].find(match => match[1].includes(text))
      assert.ok(node && Number(node[5]) > Number(node[3]) && Number(node[5]) <= 2339, `${file}: error must be inside the app viewport`)
    }
  }
  for (const name of ['diagram.png', 'photo.jpg', 'sample.webp', 'invalid.png', 'too-large.png', 'too-many-pixels.png']) assert.deepEqual(command('exec-out', 'cat', `/sdcard/Download/${fixtureName}/${name}`), await readFile(path.join(options['fixture-dir'], 'picker', name)))
  await save('saved-main.md', main); await save('portable-copy.md', copy)
  await save('verification.json', { kind: 'android-attachment-file-and-ui-verification', checkedAt: new Date().toISOString(), serial: options.serial, passed: true, hashes, localCopyName: copyNames[0], checks: ['private draft protects imported reference before explicit source save', 'PNG/JPEG/WebP assets and local copies match exact picker bytes', 'missing reference replaced without losing original body', 'invalid type/byte/pixel samples create no record or source change', 'private candidate and original note survive force-stop', 'retry confirms a new asset after folder collision is repaired', 'portable copy owns three local assets and leaves external note intact', 'all six picker fixtures unchanged'], pending: ['physical phone and release/arm64', 'Chinese IME and full TalkBack', 'actual power-loss and unconfirmed-provider binary write injection'] })
  console.log(`Native attachment verification passed; ${hashes.length} copied assets checked`)
}
