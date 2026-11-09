import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const input = process.argv.slice(2), options = Object.fromEntries(input.reduce((pairs, value, index) => { if (index % 2 === 0) pairs.push([value.replace(/^--/, ''), input[index + 1]]); return pairs }, []))
assert.ok(options.serial && options.output, 'Required: --serial --output [--stage preedit|before-save|after-save|after-undo|selection-format|before-stop|after-stop|final]')
const pkg = 'com.longyuye.mdreader.mobile.dev', fixture = 'LongEdit-Writing-20261024', hash = bytes => createHash('sha256').update(bytes).digest('hex')
const adb = (...args) => { const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...args], { maxBuffer: 8 * 1024 * 1024 }); assert.equal(result.status, 0, result.stderr.toString()); return result.stdout }
const privateFile = name => adb('exec-out', 'run-as', pkg, 'cat', name)
const prefs = privateFile('shared_prefs/longedit-mobile-roots-v1.xml').toString('utf8')
const root = [...prefs.matchAll(/<string name="([a-f0-9]{64})">([^<]+)<\/string>/g)].find(([, , uri]) => uri.endsWith(fixture)); assert.ok(root, 'Dedicated writing fixture is not authorized')
const source = adb('exec-out', 'cat', `/sdcard/Documents/${fixture}/Writing.md`)
const original = await readFile('release-artifacts/mobile-writing-fixture/Writing.md')
const draftFile = `files/drafts-v1/${hash(`${root[1]}\nWriting.md`)}.json`
const save = (name, value) => writeFile(path.join(options.output, name), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n')
const stage = options.stage || 'final'
assert.ok(['preedit', 'before-save', 'after-save', 'after-undo', 'selection-format', 'before-stop', 'after-stop', 'final'].includes(stage), 'Unknown writing verification stage')
if (['preedit', 'before-save', 'after-undo', 'selection-format', 'before-stop', 'after-stop'].includes(stage)) {
  const draft = JSON.parse(privateFile(draftFile))
  if (stage === 'preedit' || stage === 'before-save') assert.deepEqual(source, original)
  if (stage === 'preedit') assert.match(draft.content, /ni[ ']*hao/i)
  if (stage === 'before-save') { assert.equal(draft.content, original.toString('utf8') + '你好，\r\n中文'); assert.equal(draft.expectedSignature, hash(original)) }
  if (stage === 'after-undo') { assert.notEqual(draft.content, source.toString('utf8')); assert.ok(draft.content.includes('NativeWritingBody')) }
  if (stage === 'selection-format') { const before = JSON.parse(await readFile(path.join(options.output, 'before-save.json'), 'utf8')); assert.equal(source.toString('utf8'), before.draft.content); assert.equal(draft.content, before.draft.content.replace('NativeWritingBody', '**NativeWritingBody**')) }
  if (stage.endsWith('-stop')) { const before = JSON.parse(await readFile(path.join(options.output, 'before-save.json'), 'utf8')); assert.equal(source.toString('utf8'), before.draft.content); assert.ok(draft.content.startsWith(before.draft.content)); assert.match(draft.content.slice(before.draft.content.length), /^Recovery ?Pending$/); assert.equal(draft.expectedSignature, hash(source)) }
  await save(`${stage}.json`, { draft, sourceSha256: hash(source), originalSha256: hash(original) })
} else {
  const before = JSON.parse(await readFile(path.join(options.output, 'before-save.json'), 'utf8'))
  assert.equal(source.toString('utf8'), before.draft.content)
  assert.ok(!source.toString('utf8').replace(/\r\n/g, '').includes('\n'))
  await save('saved-writing.md', source)
  if (stage === 'final') {
    for (const file of ['pinyin-preedit.xml', 'chinese-candidates.xml', 'before-save.xml', 'font-200-portrait.xml', 'font-200-landscape.xml', 'after-undo.xml', 'after-redo.xml']) assert.ok((await readFile(path.join(options.output, file), 'utf8')).includes('com.longyuye.mdreader.mobile.dev'), file)
    const preedit = await readFile(path.join(options.output, 'preedit.json'), 'utf8'); assert.match(JSON.parse(preedit).draft.content, /ni[ ']*hao/i)
    assert.ok((await readFile(path.join(options.output, 'pinyin-preedit.png'))).length > 1000)
    const restored = await readFile(path.join(options.output, 'after-process-stop.xml'), 'utf8'); assert.ok(restored.includes('Recovery') && restored.includes('Pending'))
    const pending = JSON.parse(await readFile(path.join(options.output, 'before-stop.json'), 'utf8')), recovered = JSON.parse(await readFile(path.join(options.output, 'after-stop.json'), 'utf8')); assert.equal(recovered.draft.content, pending.draft.content)
    const landscape = await readFile(path.join(options.output, 'font-200-landscape.xml'), 'utf8'); assert.ok(landscape.includes('rotation="1"'))
    const bounds = (xml, label) => [...xml.matchAll(/text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)].find(match => match[1] === label)
    const normal = bounds(await readFile(path.join(options.output, 'font-100-portrait.xml'), 'utf8'), 'Writing.md'), large = bounds(await readFile(path.join(options.output, 'font-200-portrait.xml'), 'utf8'), 'Writing.md')
    assert.ok(normal && large && Number(large[5]) - Number(large[3]) > 1.5 * (Number(normal[5]) - Number(normal[3])))
    assert.ok(bounds(landscape, '文档操作'))
    assert.ok((await readFile(path.join(options.output, 'compact-after-redo.xml'), 'utf8')).includes('尚未保存到文件'))
    assert.ok((await readFile(path.join(options.output, 'compact-after-undo.xml'), 'utf8')).includes('已保存到文件'))
    assert.deepEqual(adb('exec-out', 'cat', `/sdcard/Documents/${fixture}/Landscape.md`), await readFile('release-artifacts/mobile-writing-fixture/Landscape.md'))
    await save('verification.json', { kind: 'android-gboard-writing-file-verification', checkedAt: new Date().toISOString(), passed: true, serial: options.serial, sourceSha256: hash(source), originalSha256: hash(original), checks: ['Gboard simplified Pinyin candidates and preedit protected by actual private draft', 'candidate commits, Chinese punctuation and native Enter produce exact CRLF source only after Save', 'reading/editing undo and redo retain source and restore the saved content', '200% font and rotation keep editing history and reachable controls', 'force-stop recovery exposes unsaved private input without changing source'], pending: ['physical phone and other Chinese IMEs', 'full TalkBack traversal', 'minimum API 29 and release/arm64', 'font scaling beyond the tested matrix and vendor-specific nonlinear scaling'] })
  }
}
console.log(`Native writing ${stage}: source/draft checks passed`)
