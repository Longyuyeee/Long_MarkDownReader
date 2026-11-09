import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2), options = Object.fromEntries(args.reduce((all, value, i) => { if (i % 2 === 0) all.push([value.replace(/^--/, ''), args[i + 1]]); return all }, []))
assert.ok(options.serial && options.output, 'Required: --serial --output')
const pkg = 'com.longyuye.mdreader.mobile.dev'
const adb = (...args) => {
  const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...args], { maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr.toString())
  return result.stdout
}
const hash = value => createHash('sha256').update(value).digest('hex')
const avd = adb('emu', 'avd', 'name').toString().trim().split(/\r?\n/)[0].trim()
assert.equal(avd, 'LongEdit_Compat_API29', 'Use the dedicated API 29 fixture AVD')
assert.equal(adb('shell', 'getprop', 'ro.build.version.sdk').toString().trim(), '29')
const webview = adb('shell', 'dumpsys', 'webviewupdate').toString()
assert.match(webview, /Current WebView package .*124\.0\.6367\.219/)
const connectivity = adb('shell', 'dumpsys', 'connectivity').toString()
assert.match(connectivity, /Active default network: none/)
const source = adb('exec-out', 'run-as', pkg, 'cat', 'files/library/Offline29.md')
assert.equal(source.toString(), 'OfflineSavedBody')
const files = adb('exec-out', 'run-as', pkg, 'find', 'files', '-type', 'f').toString().split(/\r?\n/)
assert.equal(files.filter(file => file.startsWith('files/drafts-v1/')).length, 0)
const load = name => readFile(path.join(options.output, name), 'utf8')
assert.ok((await load('api29-runtime-required.xml')).includes('需要更新系统组件'))
assert.ok((await load('api29-runtime-required.xml')).includes('74.0.3729.185'))
assert.ok((await load('api29-runtime-settings.xml')).includes('Android System WebView'))
for (const name of ['api29-before-save.xml', 'api29-after-save.xml', 'api29-offline-reopened.xml', 'api29-final-package-reopened.xml']) assert.ok((await load(name)).includes('text="OfflineSavedBody"'), name)
const screenshots = {}
for (const name of ['api29-runtime-required.png', 'api29-offline-library.png', 'api29-offline-reopened.png', 'api29-final-package-reopened.png']) {
  const png = await readFile(path.join(options.output, name))
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 2280)
  screenshots[name] = hash(png)
}
const build = JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json', 'utf8')).replace(/^\uFEFF/, ''))
const installedApk = adb('shell', 'pm', 'path', pkg).toString().trim().replace(/^package:/, '')
const installedApkSha256 = adb('shell', 'sha256sum', installedApk).toString().trim().split(/\s/)[0]
assert.equal(installedApkSha256, build.sha256)
await writeFile(path.join(options.output, 'api29-verification.json'), JSON.stringify({
  kind: 'android-10-offline-native-fixture', checkedAt: new Date().toISOString(), passed: true, serial: options.serial, avd,
  api: 29, webview: '124.0.6367.219', installedApkSha256, sourceSha256: hash(source), screenshots,
  checks: ['WebView 74 recovery screen and system settings reachable without loading the editor', 'WebView 124 accepts the same installed package after component update', 'no active default network', 'create, observed editor content, explicit save, force-stop and reopen preserve exact private file', 'saved draft record cleared'],
  pending: ['physical ARM64 phone', 'full workflow on declared minimum WebView 111', 'API 29 external provider and permission fault matrix', 'release signing and release upgrade', 'large documents and library performance']
}, null, 2) + '\n')
console.log('Native API 29: runtime recovery, offline source/reopen and installed package checks passed')
