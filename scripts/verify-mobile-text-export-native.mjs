import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args = process.argv.slice(2), options = Object.fromEntries(args.reduce((out, value, i) => { if (i % 2 === 0) out.push([value.replace(/^--/, ''), args[i + 1]]); return out }, []))
assert.ok(options.serial && options.output && ['safe','txt','cancel','unconfirmed','nospace','alias','kill'].includes(options.case) && ['before','picker','cancelled','exported','retried','failed','kill','recovered','final'].includes(options.stage), 'Required: --serial --output --case safe|txt|cancel|unconfirmed|nospace|alias|kill --stage before|picker|cancelled|exported|failed|kill|recovered|final')
const run = (...args) => { const result = spawnSync('E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...args], { maxBuffer: 16 * 1024 * 1024 }); assert.equal(result.status, 0, result.stderr.toString()); return result.stdout }
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(), 'LongEdit_Compat_API29')
assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(), '29')
const app = 'com.longyuye.mdreader.mobile.dev', provider = 'com.longyuye.mdreader.storagefixture', scenario = options.case, stage = options.stage
const sha = value => createHash('sha256').update(value).digest('hex'), json = bytes => JSON.parse(bytes.toString().replace(/^\uFEFF/, ''))
const manifest = json(await readFile('E:/Android/BuildCache/LongEdit-Export-20261024/manifest.json')), name = scenario === 'txt' ? 'Plain.txt' : 'Portable.md'
const original = manifest.files[name].content
assert.equal(sha(run('exec-out','cat',`/sdcard/Documents/LongEdit-Export-20261024/${name}`)), manifest.files[name].sha256, 'Export must never change the source bytes')
const prefs = run('exec-out','run-as',app,'cat','shared_prefs/longedit-mobile-roots-v1.xml').toString()
const root = [...prefs.matchAll(/<string name="([a-f0-9]{64})">([^<]+)<\/string>/g)].find(([, , uri]) => /\/tree\/(?:home:|primary:Documents\/)LongEdit-Export-20261024$/.test(decodeURIComponent(uri)))
assert.ok(root, 'Authorize the exact synthetic source folder through the system picker')
const rootId = root[1], files = folder => run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder) ? run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean) : []
const draftPath = `files/drafts-v1/${sha(`${rootId}\n${name}`)}.json`
const draft = () => files('drafts-v1').includes(draftPath) ? json(run('exec-out','run-as',app,'cat',draftPath)) : null
const protectedDraft = value => { if (!value) return null; const { updated, ...rest } = value; return rest }
const records = () => files('write-recovery').filter(file => /\/[a-f0-9-]{36}\.json$/.test(file)).map(file => { const bytes = run('exec-out','run-as',app,'cat',file); return { ...json(bytes), id: file.split('/').pop().replace('.json',''), sha256: sha(bytes) } })
await mkdir(options.output, { recursive: true })
const load = async suffix => json(await readFile(path.join(options.output, `${scenario}-${suffix}.json`)))
const save = (suffix, value) => writeFile(path.join(options.output, `${scenario}-${suffix}.json`), JSON.stringify(value, null, 2) + '\n')
const result = { kind: 'native-text-export', scenario, stage, checkedAt: new Date().toISOString(), rootId, sourcePath: name, sourceSha256: manifest.files[name].sha256 }
if (stage === 'before') {
  const candidate = draft()?.content ?? original
  if (scenario !== 'txt') { assert.equal(candidate.split('ExportDraft').length, 2); assert.equal(candidate.replace('ExportDraft', ''), original); assert.equal(draft().expectedSignature, sha(original)) }
  else { assert.equal(draft(), null); assert.equal(candidate, original) }
  if (options.destination) assert.match(options.destination, /^\/sdcard\/Download\/LongEdit-Text-Export(?:-Final)?\.(md|txt)$/)
  Object.assign(result, { destination: options.destination, candidate, draft: protectedDraft(draft()), priorRecoveryIds: records().map(record => record.id), priorCopies: files('library') })
  await save('before', result); console.log(`${scenario}: complete candidate verified before export`); process.exit(0)
}
const before = await load('before'), allRecords = records(), protectedEntry = stage === 'picker' ? null : await load('protected')
const current = allRecords.filter(record => record.purpose === 'text-export' && (protectedEntry ? record.id === protectedEntry.recoveryId : !before.priorRecoveryIds.includes(record.id)))
for (const id of before.priorRecoveryIds) assert.ok(allRecords.some(record => record.id === id), 'Earlier recovery records must remain')
if (stage === 'final' && before.draft) { const currentDraft = protectedDraft(draft()); assert.ok(currentDraft.revision >= before.draft.revision); assert.equal(currentDraft.content, before.draft.content); assert.equal(currentDraft.expectedSignature, before.draft.expectedSignature) }
else assert.deepEqual(protectedDraft(draft()), before.draft, 'Export cannot change the source draft content, revision or expected signature')
if (['picker','failed','kill','recovered'].includes(stage) || stage === 'final' && ['unconfirmed','alias','kill'].includes(scenario)) {
  assert.equal(current.length, 1); const record = current[0]
  assert.equal(record.rootId, rootId); assert.equal(record.relativePath, name); assert.equal(record.candidate, before.candidate); assert.equal(record.original, null)
  Object.assign(result, { recoveryId: record.id, candidateSha256: sha(record.candidate), privateRecordSha256: record.sha256 })
  if (stage === 'picker') { assert.match(run('shell','dumpsys','activity','activities').toString(), /com\.android\.documentsui/); await save('protected', result) }
  if (stage === 'kill') {
    assert.equal(scenario, 'kill'); const protectedRecord = await load('protected'); assert.equal(protectedRecord.privateRecordSha256, record.sha256)
    run('shell','am','force-stop',app); const stopped = spawnSync('E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, 'shell', 'pidof', app]); assert.equal(stopped.stdout.length, 0); assert.equal(stopped.status, 1)
    assert.equal(records().find(item => item.id === record.id).sha256, record.sha256); result.processTerminatedAfterFullSnapshot = true
  }
  if (stage === 'failed') {
    const ui = await readFile(path.join(options.output, `${scenario}-failed.xml`), 'utf8'); assert.ok(ui.includes(scenario === 'alias' ? '目标位置已有内容' : scenario === 'unconfirmed' ? '回读内容不一致' : '导出未确认'))
    if (scenario === 'alias') assert.equal(run('exec-out','run-as',provider,'cat','files/create-alias/Existing.md').toString(), '# Existing original\r\n\r\n已有中文😀必须保留。\r\n')
    if (scenario === 'unconfirmed' || scenario === 'nospace') {
      const folder = `files/export-${scenario}`, targets = run('exec-out','run-as',provider,'find',folder,'-type','f').toString().trim().split(/\r?\n/).filter(file => !file.endsWith('/Existing.md'))
      assert.equal(targets.length, 1); assert.equal(run('exec-out','run-as',provider,'cat',targets[0]).length, 0)
      const attempts = run('exec-out','run-as',provider,'cat',`files/export-${scenario}-writes.txt`).toString().trim().split(/\r?\n/)
      assert.equal(attempts.length, 1); result.destinationWriteOpenAttempts = attempts.length; result.destinationBytes = 0
    }
  }
  if (stage === 'recovered' || stage === 'final' && ['unconfirmed','alias','kill'].includes(scenario)) {
    const copies = files('library').filter(file => !before.priorCopies.includes(file)).map(file => ({ file, sha256: sha(run('exec-out','run-as',app,'cat',file)) }))
    assert.ok(copies.some(copy => copy.sha256 === sha(before.candidate)), 'Recover a complete independent local note through the product UI')
    result.copies = copies; assert.equal(record.sha256, (await load('protected')).privateRecordSha256)
  }
} else {
  assert.equal(current.length, 0, 'Only this completed/cancelled export snapshot should be cleared')
  if (stage === 'exported' || stage === 'retried' || stage === 'final' && ['safe','txt','nospace'].includes(scenario)) {
    const target = before.destination || (scenario === 'txt' ? '/sdcard/Download/LongEdit-Text-Export.txt' : '/sdcard/Download/LongEdit-Text-Export.md')
    const bytes = scenario === 'nospace' ? run('exec-out','run-as',provider,'cat','files/export-safe/Portable-导出副本.md') : run('exec-out','cat',target); assert.equal(bytes.toString(), before.candidate)
    result.exportedSha256 = sha(bytes); result.exportedBytes = bytes.length
  }
  if (stage === 'cancelled') assert.ok((await readFile(path.join(options.output, 'cancel-cancelled.xml'), 'utf8')).includes('已取消导出'))
}
if (stage === 'final') {
  const build = json(await readFile('release-artifacts/mobile-debug/x86_64/build-record.json')); assert.equal(build.verification.versionCode, 1002017)
  const apk = run('shell','pm','path',app).toString().trim().replace(/^package:/,'')
  result.installedApkSha256 = run('shell','sha256sum',apk).toString().trim().split(/\s+/)[0]; assert.equal(result.installedApkSha256, build.sha256)
  assert.match(run('shell','dumpsys','connectivity').toString(), /Active default network: none/)
}
result.passed = true; result.scope = 'Dedicated API 29 emulator / WebView 124; synthetic source and controlled DocumentsProvider. No physical phone or real cloud storage claim.'
await save(stage, result); console.log(`${scenario} ${stage}: source, candidate, draft and export recovery verified`)
