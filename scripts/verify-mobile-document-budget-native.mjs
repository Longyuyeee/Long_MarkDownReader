import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args = process.argv.slice(2), options = Object.fromEntries(args.reduce((all, value, i) => { if (i % 2 === 0) all.push([value.replace(/^--/, ''), args[i + 1]]); return all }, []))
assert.ok(options.serial && options.output && ['before', 'pending', 'saved', 'final'].includes(options.stage), 'Required: --serial --output --stage before|pending|saved|final')
const pkg = 'com.longyuye.mdreader.mobile.dev', fixture = 'LongEdit-DocumentBudget-20261024'
const adb = (...args) => { const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...args], { maxBuffer: 32 * 1024 * 1024 }); assert.equal(result.status, 0, result.stderr.toString()); return result.stdout }
assert.equal(adb('emu', 'avd', 'name').toString().trim().split(/\r?\n/)[0].trim(), 'LongEdit_Compat_API29')
const hash = value => createHash('sha256').update(value).digest('hex')
const fixtureDir = 'E:/Android/BuildCache/mobile-document-budget-fixture'
const manifest = JSON.parse(await readFile(path.join(fixtureDir, 'fixture-manifest.json'), 'utf8'))
const actual = Object.fromEntries(adb('shell', 'sha256sum', `/sdcard/Documents/${fixture}/*`).toString().trim().split(/\r?\n/).map(line => {
  const match = line.match(/^([a-f0-9]{64})\s+.*\/(Large\.md|Small\.md|Dense\.md|LongLine\.txt)$/); assert.ok(match, line); return [match[2], match[1]]
}))
assert.equal(Object.keys(actual).length, 4)
for (const file of manifest.files) if (file.name !== 'Large.md' || !['saved', 'final'].includes(options.stage)) assert.equal(actual[file.name], file.sha256, file.name)
const prefs = adb('exec-out', 'run-as', pkg, 'cat', 'shared_prefs/longedit-mobile-roots-v1.xml').toString()
const root = [...prefs.matchAll(/<string name="([a-f0-9]{64})">([^<]+)<\/string>/g)].find(([, , uri]) => uri.endsWith(fixture))
assert.ok(root, 'Synthetic directory authorization must remain present')
const source = adb('exec-out', 'cat', `/sdcard/Documents/${fixture}/Large.md`)
const original = await readFile(path.join(fixtureDir, 'library/Large.md'))
assert.equal(original.length, 4 * 1024 * 1024 - 1024)
const record = { kind: 'native-document-budget', checkedAt: new Date().toISOString(), stage: options.stage, serial: options.serial, rootId: root[1], sourceBytes: source.length, sourceSha256: hash(source), files: actual }
const draftPath = `files/drafts-v1/${hash(`${root[1]}\nLarge.md`)}.json`
if (options.stage === 'pending') {
  const draft = JSON.parse(adb('exec-out', 'run-as', pkg, 'cat', draftPath))
  assert.equal(draft.content.split('BudgetSaved').length, 2)
  assert.equal(draft.content.replace('BudgetSaved', ''), original.toString())
  assert.equal(draft.expectedSignature, hash(original))
  record.draft = { bytes: Buffer.byteLength(draft.content), contentSha256: hash(draft.content), revision: draft.revision, expectedSignature: draft.expectedSignature }
}
if (['saved', 'final'].includes(options.stage)) {
  const pending = JSON.parse(await readFile(path.join(options.output, 'pending.json'), 'utf8'))
  assert.equal(hash(source), pending.draft.contentSha256)
  assert.equal(source.toString().replace('BudgetSaved', ''), original.toString())
  record.passed = true
  if (options.stage === 'final') {
    const saved = JSON.parse(await readFile(path.join(options.output, 'saved.json'), 'utf8')); assert.equal(saved.passed, true)
    const draftFiles = adb('exec-out', 'run-as', pkg, 'find', 'files/drafts-v1', '-type', 'f').toString().split(/\r?\n/)
    assert.ok(!draftFiles.includes(draftPath), 'Saved draft generation removed')
    for (const [name, expected] of [['source-tail.xml', 'TailNeedle'], ['reopened.xml', 'BudgetSaved'], ['dense.xml', '文稿排版较密集'], ['longline.xml', 'LongLineEnd']]) assert.ok((await readFile(path.join(options.output, name), 'utf8')).includes(expected), name)
    assert.ok((await readFile(path.join(options.output, 'source-tail.xml'), 'utf8')).includes('最后一句，不能丢失。'), 'Actual tail text must be in the native accessibility tree')
    assert.ok((await readFile(path.join(options.output, 'final-library.xml'), 'utf8')).includes('Small.md Markdown'), 'Return from ordinary iframe must expose the real file row')
    const small = await readFile(path.join(options.output, 'small.xml'), 'utf8')
    assert.ok(small.includes('普通文稿') && !small.includes('已分段显示原文'), 'Normal Markdown renders with packaged worker')
    const build = JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json', 'utf8')).replace(/^\uFEFF/, ''))
    assert.equal(build.verification.versionCode, 1002014)
    const apk = adb('shell', 'pm', 'path', pkg).toString().trim().replace(/^package:/, '')
    record.installedApkSha256 = adb('shell', 'sha256sum', apk).toString().trim().split(/\s/)[0]
    assert.equal(record.installedApkSha256, build.sha256)
    assert.match(adb('shell', 'dumpsys', 'connectivity').toString(), /Active default network: none/)
    record.scope = 'Dedicated API 29 AVD / WebView 124: real SAF 4 MiB minus 1 KiB document, whole-source tail search, exact single edit preserving mixed newlines, private draft/save/force-stop/reopen; ordinary packaged worker, dense and long-line fallback. No physical-phone performance claim.'
  }
}
await mkdir(options.output, { recursive: true })
await writeFile(path.join(options.output, `${options.stage}.json`), JSON.stringify(record, null, 2) + '\n')
console.log(`Native document budget ${options.stage}: exact source and stage checks passed`)
