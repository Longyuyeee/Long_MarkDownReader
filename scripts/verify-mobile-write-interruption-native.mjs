import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args = process.argv.slice(2), options = Object.fromEntries(args.reduce((all, value, i) => { if (i % 2 === 0) all.push([value.replace(/^--/, ''), args[i + 1]]); return all }, []))
assert.ok(options.serial && options.output && ['nospace', 'interrupted'].includes(options.scenario) && ['before', 'failed', 'kill', 'final'].includes(options.stage), 'Required: --serial --output --scenario nospace|interrupted --stage before|failed|kill|final')
assert.ok(options.stage !== 'kill' || options.scenario === 'interrupted')
const pkg = 'com.longyuye.mdreader.mobile.dev', provider = 'com.longyuye.mdreader.storagefixture'
const run = (...args) => { const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...args], { maxBuffer: 32 * 1024 * 1024 }); assert.equal(result.status, 0, result.stderr.toString()); return result.stdout }
const appPid = () => { const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, 'shell', 'pidof', pkg]); assert.ok(result.status === 0 || result.status === 1, result.stderr.toString()); return result.stdout.toString().trim() }
assert.equal(run('emu', 'avd', 'name').toString().trim().split(/\r?\n/)[0].trim(), 'LongEdit_Compat_API29', 'Never terminate a user device')
assert.equal(run('shell', 'getprop', 'ro.build.version.sdk').toString().trim(), '29')
const sha = value => createHash('sha256').update(value).digest('hex'), scenario = options.scenario, marker = scenario === 'nospace' ? 'NoSpaceDraft' : 'InterruptedDraft'
const original = scenario === 'nospace' ? '# Provider original\n\n原始中文内容必须保留。\n' : '# Interrupted original\r\n\r\n' + 'Original 中文😀\r\n'.repeat(8192) + 'TailRecover\r\n保留最后一句。\r\n'
const prefs = run('exec-out', 'run-as', pkg, 'cat', 'shared_prefs/longedit-mobile-roots-v1.xml').toString()
const root = [...prefs.matchAll(/<string name="([a-f0-9]{64})">([^<]+)<\/string>/g)].find(([, , uri]) => uri.endsWith(`/tree/${scenario}`))
assert.ok(root, 'Scenario must be explicitly authorized with the system picker')
const relativePath = `${scenario}-note.md`, draftFile = `files/drafts-v1/${sha(`${root[1]}\n${relativePath}`)}.json`
const providerSource = () => run('exec-out', 'run-as', provider, 'cat', `files/${scenario}.md`)
const providerAttempt = () => {
  if (!run('exec-out', 'run-as', provider, 'ls', 'files').toString().split(/\s+/).includes('interrupted-started.json')) return null
  try { return JSON.parse(run('exec-out', 'run-as', provider, 'cat', 'files/interrupted-started.json')) } catch { return null }
}
const appFiles = folder => run('exec-out', 'run-as', pkg, 'ls', 'files').toString().split(/\s+/).includes(folder) ? run('exec-out', 'run-as', pkg, 'find', `files/${folder}`, '-type', 'f').toString().trim().split(/\r?\n/).filter(Boolean) : []
const records = () => appFiles('write-recovery').filter(file => /\/[a-f0-9-]{36}\.json$/.test(file)).map(file => {
  const raw = run('exec-out', 'run-as', pkg, 'cat', file), record = JSON.parse(raw)
  return { ...record, id: file.split('/').pop().replace('.json', ''), privateSha256: sha(raw) }
}).filter(record => record.rootId === root[1] && record.relativePath === relativePath)
await mkdir(options.output, { recursive: true })
const save = (name, data) => writeFile(path.join(options.output, name), JSON.stringify(data, null, 2) + '\n')
const snapshot = { kind: 'controlled-native-write-fault', checkedAt: new Date().toISOString(), scenario, stage: options.stage, rootId: root[1], relativePath, originalBytes: Buffer.byteLength(original), originalSha256: sha(original) }
if (options.stage === 'before') {
  assert.equal(providerSource().toString(), original)
  snapshot.priorRecoveryIds = records().map(record => record.id)
  snapshot.priorCopies = appFiles('library')
  if (scenario === 'interrupted') snapshot.priorAttempt = providerAttempt()?.attempt || null
  await save(`${scenario}-before.json`, snapshot)
  console.log(`${scenario} original source verified`)
  process.exit(0)
}
const before = JSON.parse(await readFile(path.join(options.output, `${scenario}-before.json`), 'utf8'))
if (options.stage === 'kill') {
  // The marker is written by the provider only after the application's actual
  // first eight bytes were synced to its backing file. The rest fills its pipe.
  let started
  for (let attempt = 0; attempt < 80; attempt++) {
    started = providerAttempt()
    if (started && started.attempt !== before.priorAttempt) break
    started = null; await new Promise(resolve => setTimeout(resolve, 150))
  }
  assert.ok(started && /^[a-f0-9-]{36}$/.test(started.attempt), 'Provider did not reach a controlled partial commit')
  assert.equal(started.prefixBytes, 8)
  snapshot.attempt = started.attempt
}
const record = records().filter(record => !before.priorRecoveryIds.includes(record.id)).sort((a, b) => b.created - a.created)[0]
assert.ok(record, 'A new private recovery must exist before terminating a writer')
assert.equal(record.original, original); assert.equal(record.candidate.split(marker).length, 2)
assert.equal(record.candidate.replace(marker, ''), original); assert.equal(record.expectedSignature, sha(original))
snapshot.recoveryId = record.id; snapshot.candidateSha256 = sha(record.candidate); snapshot.candidateBytes = Buffer.byteLength(record.candidate); snapshot.privateRecoverySha256 = record.privateSha256
if (['failed', 'kill'].includes(options.stage)) {
  const draft = JSON.parse(run('exec-out', 'run-as', pkg, 'cat', draftFile))
  assert.equal(draft.content, record.candidate); assert.equal(draft.expectedSignature, sha(original))
  snapshot.draftRevision = draft.revision
  const source = providerSource()
  assert.equal(source.toString(), scenario === 'nospace' ? original : Buffer.from(record.candidate).subarray(0, 8).toString())
  snapshot.providerSourceBytes = source.length; snapshot.providerSourceSha256 = sha(source)
  await save(`${scenario}-recovery.json`, record)
  if (options.stage === 'kill') {
    assert.ok(appPid(), 'Writer must still be alive')
    const ui = await readFile(path.join(options.output, 'interrupted-saving.xml'), 'utf8')
    assert.ok(ui.includes('保存中'), 'No successful receipt before interruption')
    snapshot.privateVersionsVerifiedBeforeKill = true
    await save('interrupted-protected.json', snapshot)
    try {
      run('shell', 'am', 'force-stop', pkg)
      assert.equal(appPid(), '')
      snapshot.processTerminated = true
    } finally { run('shell', 'run-as', provider, 'touch', `files/interrupt-release-${snapshot.attempt}`) }
    await save('interrupted-killed.json', snapshot)
    console.log('Controlled partial commit: both private versions verified, writer terminated, provider released')
  } else {
    assert.ok((await readFile(path.join(options.output, 'nospace-failed.xml'), 'utf8')).includes('文件提供器报告空间不足'))
    await save('nospace-failed.json', snapshot)
    console.log('Quota refusal: original, candidate and new private recovery verified')
  }
} else {
  const protectedRecord = JSON.parse(await readFile(path.join(options.output, `${scenario}-recovery.json`), 'utf8'))
  assert.equal(record.id, protectedRecord.id); assert.equal(record.privateSha256, protectedRecord.privateSha256)
  const expectedSource = scenario === 'nospace' ? original : Buffer.from(record.candidate).subarray(0, 8).toString()
  assert.equal(providerSource().toString(), expectedSource)
  const newCopies = appFiles('library').filter(file => !before.priorCopies.includes(file) && file.split('/').pop().startsWith(`${scenario}-note-`))
  const copies = newCopies.map(file => ({ file, sha256: sha(run('exec-out', 'run-as', pkg, 'cat', file)) }))
  assert.ok(copies.some(copy => copy.sha256 === sha(original)), 'Original rescue copy missing')
  assert.ok(copies.some(copy => copy.sha256 === sha(record.candidate)), 'Candidate rescue copy missing')
  snapshot.copies = copies
  const draft = JSON.parse(run('exec-out', 'run-as', pkg, 'cat', draftFile)); assert.equal(draft.content, record.candidate)
  if (scenario === 'interrupted') {
    const killed = JSON.parse(await readFile(path.join(options.output, 'interrupted-killed.json'), 'utf8')); assert.equal(killed.processTerminated, true)
    assert.ok((await readFile(path.join(options.output, 'interrupted-reopened.xml'), 'utf8')).includes('上次的编辑还在'))
    const exported = JSON.parse(run('exec-out', 'cat', `/sdcard/Download/Long编辑-保存恢复-${record.id.slice(0, 8)}.json`))
    assert.equal(exported.original, original); assert.equal(exported.candidate, record.candidate); assert.equal(exported.format, 'longedit-write-recovery')
    snapshot.exportVerified = true
  }
  const build = JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json', 'utf8')).replace(/^\uFEFF/, ''))
  assert.equal(build.verification.versionCode, 1002015)
  const apk = run('shell', 'pm', 'path', pkg).toString().trim().replace(/^package:/, '')
  snapshot.installedApkSha256 = run('shell', 'sha256sum', apk).toString().trim().split(/\s/)[0]; assert.equal(snapshot.installedApkSha256, build.sha256)
  assert.match(run('shell', 'dumpsys', 'connectivity').toString(), /Active default network: none/)
  snapshot.passed = true; snapshot.scope = 'Dedicated API 29 AVD / WebView 124 with a separate synthetic DocumentsProvider. Provider quota refusal and controlled partial pipe commit are not device-wide disk exhaustion, power loss or a physical phone.'
  await save(`${scenario}-final.json`, snapshot)
  console.log(`${scenario} final: original/candidate copies, private record/draft, provider bytes and installed package verified`)
}
