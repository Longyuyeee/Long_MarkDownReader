import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2), options = Object.fromEntries(args.reduce((all, value, i) => { if (i % 2 === 0) all.push([value.replace(/^--/, ''), args[i + 1]]); return all }, []))
assert.ok(options.serial && options.output && ['before', 'after', 'resumed'].includes(options.stage), 'Required: --serial --output --stage before|after|resumed')
const pkg = 'com.longyuye.mdreader.mobile.dev'
const adb = (...args) => {
  const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...args], { maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr.toString())
  return result.stdout
}
const avd = adb('emu', 'avd', 'name').toString().trim().split(/\r?\n/)[0].trim()
assert.equal(avd, 'LongEdit_A11y_Fresh_API35', 'Only the dedicated synthetic-data upgrade AVD is supported')
const hash = value => createHash('sha256').update(value).digest('hex')
const privateFile = name => adb('exec-out', 'run-as', pkg, 'cat', name)
const names = adb('exec-out', 'run-as', pkg, 'find', 'files', '-type', 'f').toString().trim().split(/\r?\n/).filter(name => /^(files\/library\/|files\/drafts-v1\/)/.test(name)).sort()
const files = Object.fromEntries(names.map(name => [name, hash(privateFile(name))]))
const source = privateFile('files/library/NativeAccessibility.md').toString()
assert.equal(source, 'NativeSavedBody')
const drafts = names.filter(name => name.startsWith('files/drafts-v1/')).map(name => ({ name, value: JSON.parse(privateFile(name)) }))
assert.equal(drafts.length, 1)
assert.equal(drafts[0].value.content, 'NativeSavedBody UpgradePending')
assert.equal(drafts[0].value.expectedSignature, hash(Buffer.from(source)))
const packageInfo = adb('shell', 'dumpsys', 'package', pkg).toString()
const versionCode = Number(packageInfo.match(/versionCode=(\d+)/)?.[1])
const apk = adb('shell', 'pm', 'path', pkg).toString().trim().replace(/^package:/, '')
const installedApkSha256 = adb('shell', 'sha256sum', apk).toString().trim().split(/\s/)[0]
const offline = Object.fromEntries(['wifi_on', 'mobile_data'].map(key => [key, adb('shell', 'settings', 'get', 'global', key).toString().trim()]))
assert.equal(offline.wifi_on, '0'); assert.equal(offline.mobile_data, '0')
const snapshot = { kind: 'android-debug-upgrade-snapshot', checkedAt: new Date().toISOString(), serial: options.serial, avd, versionCode, installedApkSha256, files, source, drafts, offline }
await mkdir(options.output, { recursive: true })
if (options.stage === 'before') assert.equal(versionCode, 1002011)
else {
  const before = JSON.parse(await readFile(path.join(options.output, 'before.json')))
  const build = JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json', 'utf8')).replace(/^\uFEFF/, ''))
  assert.equal(versionCode, 1002012)
  if (options.stage === 'after') {
    assert.deepEqual(files, before.files, 'Saved documents, attachment bytes and pending drafts must survive without mutation')
    assert.deepEqual(drafts, before.drafts)
  } else {
    // Choosing Continue protects a new editing session. Its generation/time may
    // advance; the protected document identity, source signature and text may not.
    const contents = values => values.map(({ name, value: { revision, updated, ...protectedValue } }) => ({ name, value: protectedValue }))
    assert.deepEqual(contents(drafts), contents(before.drafts))
    assert.deepEqual(Object.fromEntries(Object.entries(files).filter(([name]) => !name.startsWith('files/drafts-v1/'))), Object.fromEntries(Object.entries(before.files).filter(([name]) => !name.startsWith('files/drafts-v1/'))))
    assert.ok(drafts[0].value.revision >= before.drafts[0].value.revision)
    assert.ok(drafts[0].value.updated >= before.drafts[0].value.updated)
  }
  assert.equal(installedApkSha256, build.sha256)
  snapshot.passed = true
  snapshot.scope = 'Same-debug-key API 35 emulator upgrade, offline launch, exact saved source and pending private draft. Physical phone/release signing remain pending.'
}
await writeFile(path.join(options.output, `${options.stage}.json`), JSON.stringify(snapshot, null, 2) + '\n')
console.log(`Native upgrade ${options.stage}: exact source/draft/installed package checks passed`)
