import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ''), values[index + 1]]], []))
assert.equal(args.serial, 'emulator-5558'); assert.ok(args.output && ['before','protected','cancel','safe','unconfirmed','nospace','kill','retry','alias','missing','final'].includes(args.stage))
const app = 'com.longyuye.mdreader.mobile.dev', provider = 'com.longyuye.mdreader.storagefixture'
const run = (...values) => { const result = spawnSync('E:/Android/Sdk/platform-tools/adb.exe', ['-s', args.serial, ...values], { maxBuffer: 24 * 1024 * 1024 }); assert.equal(result.status, 0, result.stderr.toString()); return result.stdout }
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(), 'LongEdit_Compat_API29'); assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(), '29')
const sha = value => createHash('sha256').update(value).digest('hex'), json = value => JSON.parse(value.toString().replace(/^\ufeff/, ''))
const files = folder => run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder) ? run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean) : []
const read = file => run('exec-out','run-as',app,'cat',file)
const drafts = () => Object.fromEntries(files('drafts-v1').filter(file => file.endsWith('.json')).sort().map(file => { const { updated, ...record } = json(read(file)); return [file, record] }))
const library = () => Object.fromEntries(files('library').sort().map(file => [file, sha(read(file))]))
const records = () => files('pack-exports-v1').filter(file => /\/[a-f0-9-]{36}\.json$/.test(file)).map(file => json(read(file)))
const fixture = json(await readFile('E:/Android/BuildCache/LongEdit-Pack-20261024/manifest.json'))
for (const [file, expected] of Object.entries(fixture)) assert.equal(sha(run('exec-out','cat',`/sdcard/Documents/LongEdit-Pack-20261024/${file}`)), expected.sha256, `Source unchanged: ${file}`)
await mkdir(args.output, { recursive: true })
const load = name => readFile(path.join(args.output, `${name}.json`)).then(json)
const save = (name, data) => writeFile(path.join(args.output, `${name}.json`), JSON.stringify(data, null, 2) + '\n')
if (args.stage === 'before') { const all = records(), current = all.filter(record => record.sources.some(source => source.uri.includes('LongEdit-Pack-20261024'))); await save('before', { library: library(), drafts: drafts(), priorIds: all.filter(record => !current.includes(record)).map(record => record.id), packageIdsAlreadyStaged: current.map(record => record.id) }); console.log('Baseline synthetic library, all draft semantic fields and every source byte recorded; any already-staged synthetic package IDs are explicit'); process.exit(0) }
const before = await load('before'); assert.deepEqual(library(), before.library, 'Existing app-private notes unchanged')
const nowDrafts = drafts()
// Opening the explicit recovery UI is permitted to advance its revision;
// export operations may never change content or expected source signature.
for (const [file, old] of Object.entries(before.drafts)) { assert.ok(nowDrafts[file]); assert.equal(nowDrafts[file].content, old.content); assert.equal(nowDrafts[file].expectedSignature, old.expectedSignature); assert.ok(nowDrafts[file].revision >= old.revision) }
const result = { kind: 'native-portable-pack', stage: args.stage, checkedAt: new Date().toISOString(), sourceFiles: Object.keys(fixture).length, passed: false }
let record
if (args.stage === 'protected') {
  const newRecords = records().filter(record => !before.priorIds.includes(record.id)); assert.equal(newRecords.length, 1); record = newRecords[0]
  assert.match(run('shell','dumpsys','activity','activities').toString(), /com\.android\.documentsui/)
  const sourceDraft = Object.values(nowDrafts).find(draft => draft.relativePath === 'Portable.md' && draft.content.includes('PackDraft'))
  assert.ok(sourceDraft); assert.equal(sourceDraft.content.split('PackDraft').length, 2)
  Object.assign(result, { id: record.id, candidate: sourceDraft.content, draft: sourceDraft, metadata: record })
} else if (!['alias','missing'].includes(args.stage)) { const protectedRecord = await load('protected'); record = records().find(record => record.id === protectedRecord.id); assert.ok(record); assert.deepEqual(record, protectedRecord.metadata); assert.deepEqual(nowDrafts[Object.keys(nowDrafts).find(file => nowDrafts[file].rootId === protectedRecord.draft.rootId && nowDrafts[file].relativePath === 'Portable.md')], protectedRecord.draft) }
if (record) {
  const bytes = read(`files/pack-exports-v1/${record.id}.zip`)
  assert.equal(bytes.length, record.bytes); assert.equal(sha(bytes), record.digest)
  const verify = spawnSync('python', ['-c', 'import sys,zipfile,io,json,base64; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist() if not n.endswith("/")}))'], { input: bytes, maxBuffer: 24 * 1024 * 1024 })
  assert.equal(verify.status, 0, verify.stderr.toString()); const entries = Object.fromEntries(Object.entries(json(verify.stdout)).map(([name, value]) => [name, Buffer.from(value, 'base64')]))
  const candidate = args.stage === 'protected' ? result.candidate : (await load('protected')).candidate
  const expected = candidate.replaceAll('files/%E5%9B%BE%20%23.png', 'assets/001-%E5%9B%BE%20%23.png').replace('files/a.pdf', 'assets/002-a.pdf').replace('files/empty.pdf', 'assets/003-empty.pdf').replaceAll('](assets/', '](<assets/').replaceAll('.png)', '.png>)').replaceAll('#page=2)', '#page=2>)').replaceAll('empty.pdf)', 'empty.pdf>)')
  assert.equal(entries['note.textbundle/text.markdown'].toString(), expected); assert.equal(JSON.parse(entries['note.textbundle/info.json']).version, 2)
  for (const asset of record.assets) { const entry = entries['note.textbundle/' + asset.archivePath]; assert.ok(entry); assert.equal(sha(entry), fixture[asset.sourcePath].sha256); assert.equal(entry.length, asset.bytes) }
  assert.equal(record.assets.length, 3); assert.equal(record.sources.length, 4)
  Object.assign(result, { id: record.id, archiveBytes: bytes.length, archiveSha256: sha(bytes), members: Object.keys(entries), draftRevision: nowDrafts[Object.keys(nowDrafts).find(file => nowDrafts[file].rootId === record.rootId && nowDrafts[file].relativePath === 'Portable.md')].revision })
  if (args.stage === 'safe' || args.stage === 'retry') {
    assert.ok(args.target)
    const exported = args.target.startsWith('/sdcard/') ? run('exec-out','cat',args.target) : run('exec-out','run-as',provider,'cat',args.target)
    assert.deepEqual(exported, bytes); await writeFile(path.join(args.output, `${args.stage}.textpack`), bytes)
    if (args.stage === 'retry') { assert.ok(!/UriPermission[^\n]*tree\/home%3ALongEdit-Pack-20261024\s/.test(run('shell','dumpsys','activity','permissions').toString())); result.sourceTreeGrantRemoved = true }
  }
  if (args.stage === 'kill') { run('shell','am','force-stop',app); assert.equal(spawnSync('E:/Android/Sdk/platform-tools/adb.exe', ['-s',args.serial,'shell','pidof',app]).status, 1); assert.equal(sha(read(`files/pack-exports-v1/${record.id}.zip`)), record.digest); result.interruptedAfterDurableArchive = true }
}
if (args.stage === 'alias') { assert.equal(run('exec-out','run-as',provider,'cat','files/pack-alias/empty.pdf').length, 0); const meta = records().find(record => record.relativePath === 'Existing.md' && record.assets.some(asset => asset.sourcePath === 'empty.pdf')); assert.ok(meta); assert.ok(meta.sources.some(source => source.documentId === 'pack-alias/empty.pdf')); result.zeroByteSourceProtected = true }
if (['cancel','safe','unconfirmed','nospace','retry','alias','missing'].includes(args.stage)) {
  const output = run('shell','uiautomator','dump','/sdcard/longedit-pack-result.xml'); assert.match(output.toString(), /dumped to/)
  const ui = run('exec-out','cat','/sdcard/longedit-pack-result.xml'); await writeFile(path.join(args.output, `${args.stage}.xml`), ui)
  const phrase = { cancel: '已取消', safe: '回读确认', retry: '回读确认', unconfirmed: '回读内容不一致', nospace: '导出未确认', alias: '源笔记或源附件', missing: '无法携带' }[args.stage]
  assert.ok(ui.toString().includes(phrase), `Actual UI must explain ${phrase}`)
  if (args.stage === 'missing') assert.ok(!records().some(record => record.relativePath === 'Missing.md'))
}
const build = json(await readFile('release-artifacts/mobile-debug/x86_64/build-record.json')); assert.equal(build.verification.versionCode, 1002020)
if (args.stage === 'final') {
  const providerFiles = run('exec-out','run-as',provider,'ls','files').toString().split(/\s+/)
  assert.ok(!providerFiles.includes('pack-alias-writes.txt'), 'Source identity must be rejected before opening the zero-byte attachment for writing')
  assert.equal(run('exec-out','run-as',provider,'cat','files/pack-alias/empty.pdf').length, 0)
  assert.equal(run('exec-out','run-as',provider,'cat','files/pack-alias/Existing.md').toString(), '# Empty attachment\r\n[空附件](empty.pdf)\r\n')
  for (const scenario of ['unconfirmed', 'nospace']) {
    assert.equal(run('exec-out','run-as',provider,'cat',`files/export-${scenario}/Portable-附件包.textpack`).length, 0)
    const writes = run('exec-out','run-as',provider,'cat',`files/export-${scenario}-writes.txt`).toString().trim().split(/\r?\n/).filter(line => line === `export-${scenario}/Portable-附件包.textpack`)
    assert.equal(writes.length, 1)
  }
  result.sourceAliasWriteOpenAttempts = 0; result.failedDestinationBytes = 0; result.failureWriteAttemptsPerProvider = 1
}
const apk = run('shell','pm','path',app).toString().trim().replace(/^package:/, '')
result.installedApkSha256 = run('shell','sha256sum',apk).toString().trim().split(/\s+/)[0]; assert.equal(result.installedApkSha256, build.sha256)
assert.match(run('shell','dumpsys','connectivity').toString(), /Active default network: none/)
result.passed = true; result.scope = 'Dedicated API29 emulator / WebView124; synthetic sources and controlled provider, no physical phone or competitor app round-trip claim.'
await save(args.stage, result); console.log(`${args.stage}: native package, source bytes, protected draft and installed APK verified`)
