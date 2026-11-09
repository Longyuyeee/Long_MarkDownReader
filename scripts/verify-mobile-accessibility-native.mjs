import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const serial = process.argv[process.argv.indexOf('--serial') + 1]
if (!/^emulator-\d+$/.test(serial || '')) throw new Error('Pass an explicit --serial emulator-NNNN')
const output = 'docs/evidence/mobile-0.1.0/accessibility-native-2026-10-24'
const adb = process.env.LONGEDIT_ADB || 'E:/Android/Sdk/platform-tools/adb.exe'
const call = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8' })
assert.equal(call('emu', 'avd', 'name').split(/\r?\n/)[0].trim(), 'LongEdit_A11y_Fresh_API35')
const app = 'com.longyuye.mdreader.mobile.dev'
const content = call('exec-out', 'run-as', app, 'cat', 'files/library/NativeAccessibility.md')
assert.equal(content, 'NativeSavedBody')
const listing = call('exec-out', 'run-as', app, 'find', 'files', '-maxdepth', '3', '-type', 'f').trim().split(/\r?\n/)
assert.equal(listing.filter(file => file.startsWith('files/drafts-v1/')).length, 0)
const installedPath = call('shell', 'pm', 'path', app).trim().replace(/^package:/, '')
assert.ok(installedPath.startsWith('/data/app/') && installedPath.endsWith('/base.apk') && !/\s/.test(installedPath))
const installedHash = call('shell', 'sha256sum', installedPath).trim().split(/\s/)[0]
const build = JSON.parse(await readFile(path.join(output, 'build-record.json'), 'utf8'))
assert.equal(installedHash, build.sha256)
const screens = ['final-library-dialog-next-3.png', 'final-picker-return.png', 'theme-state-before.png', 'theme-state-after.png', 'reading-next-4.png', 'reopen-title-focus.png', 'return-created-note.png', 'reopen-return-row.png', 'save-confirmed.png']
for (const screen of screens) {
  const bytes = await readFile(path.join(output, screen))
  assert.ok(bytes.length > 100 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), screen)
}
const report = {
  kind: 'native-accessibility-artifact-integrity-and-saved-source', passed: true,
  testedAt: new Date().toISOString(), serial, avd: 'LongEdit_A11y_Fresh_API35',
  api: call('shell', 'getprop', 'ro.build.version.sdk').trim(),
  talkBack: call('shell', 'dumpsys', 'package', 'com.google.android.marvin.talkback').match(/versionName=([^\s]+)/)?.[1],
  webView: call('shell', 'dumpsys', 'package', 'com.google.android.webview').match(/versionName=([^\s]+)/)?.[1],
  installedApkSha256: installedHash, sourceContent: content,
  sourceSha256: createHash('sha256').update(content).digest('hex'), privateDraftsRemaining: 0,
  screenshotsPresent: screens,
  scope: 'Real TalkBack kernel keyboard events and manually reviewed focus/speech-output screenshots; ordinary ADB input for navigation and ASCII entry. The verifier checks files and artifact integrity, not speech quality.',
  touchExplorationVerified: false, completeTalkBackAcceptance: false,
}
await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`Native accessibility file/APK integrity passed (${report.talkBack}, API ${report.api}); full touch traversal remains open`)
