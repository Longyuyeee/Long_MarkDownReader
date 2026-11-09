import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2), options = Object.fromEntries(args.reduce((all, value, i) => { if (i % 2 === 0) all.push([value.replace(/^--/, ''), args[i + 1]]); return all }, []))
assert.ok(options.serial && options.output && ['before', 'pending', 'saved', 'final'].includes(options.stage), 'Required: --serial --output --stage before|pending|saved|final')
const pkg = 'com.longyuye.mdreader.mobile.dev', fixture = 'LongEdit-Scale-20261024'
const adb = (...args) => { const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...args], { maxBuffer: 16 * 1024 * 1024 }); assert.equal(result.status, 0, result.stderr.toString()); return result.stdout }
assert.equal(adb('emu', 'avd', 'name').toString().trim().split(/\r?\n/)[0].trim(), 'LongEdit_Compat_API29')
const hash = value => createHash('sha256').update(value).digest('hex')
const manifest = JSON.parse(await readFile('E:/Android/BuildCache/mobile-scale-fixture/fixture-manifest.json', 'utf8'))
const actual = Object.fromEntries(adb('shell', 'sha256sum', `/sdcard/Documents/${fixture}/*.md`).toString().trim().split(/\r?\n/).map(line => {
  const match = line.match(/^([a-f0-9]{64})\s+.*\/(Note-\d{4}\.md)$/); assert.ok(match, line); return [match[2], match[1]]
}))
assert.equal(Object.keys(actual).length, 1000)
for (const file of manifest.files) if (file.name !== 'Note-0999.md' || !['saved', 'final'].includes(options.stage)) assert.equal(actual[file.name], file.sha256, file.name)
const prefs = adb('exec-out', 'run-as', pkg, 'cat', 'shared_prefs/longedit-mobile-roots-v1.xml').toString()
const root = [...prefs.matchAll(/<string name="([a-f0-9]{64})">([^<]+)<\/string>/g)].find(([, , uri]) => uri.endsWith(fixture))
assert.ok(root, 'Synthetic directory authorization must remain present')
const source = adb('exec-out', 'cat', `/sdcard/Documents/${fixture}/Note-0999.md`)
const original = await readFile('E:/Android/BuildCache/mobile-scale-fixture/library/Note-0999.md')
const snapshot = { kind: 'android-10-library-scale-files', checkedAt: new Date().toISOString(), serial: options.serial, rootId: root[1], count: 1000, fixtureBytes: manifest.textBytes, sourceSha256: hash(source), files: actual }
if (options.stage === 'pending') {
  const draftPath = `files/drafts-v1/${hash(`${root[1]}\nNote-0999.md`)}.json`
  const draft = JSON.parse(adb('exec-out', 'run-as', pkg, 'cat', draftPath))
  assert.equal(draft.content.split('ScaleSaved').length, 2)
  assert.equal(draft.content.replace('ScaleSaved', ''), original.toString())
  assert.equal(draft.expectedSignature, hash(original)); snapshot.draft = draft
} else if (options.stage === 'final' || options.stage === 'saved') {
  const pending = JSON.parse(await readFile(path.join(options.output, 'pending.json'), 'utf8'))
  assert.equal(source.toString(), pending.draft.content)
  if (options.stage === 'final') {
    const ui = await readFile(path.join(options.output, 'reopened.xml'), 'utf8')
    assert.ok(ui.includes('Note-0999.md') && ui.includes('ScaleSaved'))
    const draftFiles = adb('exec-out', 'run-as', pkg, 'find', 'files/drafts-v1', '-type', 'f').toString().split(/\r?\n/)
    assert.ok(!draftFiles.includes(`files/drafts-v1/${hash(`${root[1]}\nNote-0999.md`)}.json`), 'Saved generation must not remain as a pending draft')
    for (const [name, expected] of [['provider-nulls-list.xml', '时间未提供'], ['provider-nulls-read.xml', '原始中文内容必须保留。'], ['provider-duplicate.xml', '同名条目无法唯一定位'], ['provider-offline.xml', '暂时无法打开这个位置']]) {
      assert.ok((await readFile(path.join(options.output, name), 'utf8')).includes(expected), name)
    }
    const providerOriginal = adb('exec-out', 'run-as', 'com.longyuye.mdreader.storagefixture', 'cat', 'files/unconfirmed.md')
    assert.equal(providerOriginal.toString(), '# Provider original\n\n原始中文内容必须保留。\n')
    snapshot.providerOriginalSha256 = hash(providerOriginal)
    snapshot.providerChecks = ['nullable metadata retains readable content and shows unknown time', 'ambiguous display name rejected', 'offline enumeration remains an error, not an empty directory', 'provider fixture original unchanged']
  }
  const pathsUi = await readFile(path.join(options.output, 'path-search.xml'), 'utf8')
  assert.ok(pathsUi.includes('未读取文稿正文') && pathsUi.includes('Note-0999.md'))
  const build = JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json', 'utf8')).replace(/^\uFEFF/, ''))
  const apk = adb('shell', 'pm', 'path', pkg).toString().trim().replace(/^package:/, '')
  snapshot.installedApkSha256 = adb('shell', 'sha256sum', apk).toString().trim().split(/\s/)[0]
  assert.equal(snapshot.installedApkSha256, build.sha256)
  assert.equal(build.verification.versionCode, 1002013)
  assert.match(adb('shell', 'dumpsys', 'connectivity').toString(), /Active default network: none/)
  snapshot.passed = true
  snapshot.scope = 'API 29, WebView 124, native SAF directory with 1,000 synthetic Markdown files. Filename and metadata path lookup, edit/save/restart, all 1,000 source hashes. Browser DOM measurements are separate; no physical-phone performance claim.'
}
await mkdir(options.output, { recursive: true })
await writeFile(path.join(options.output, `${options.stage}.json`), JSON.stringify(snapshot, null, 2) + '\n')
console.log(`Native library scale ${options.stage}: source hashes, authorized identity and stage checks passed`)
