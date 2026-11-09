import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const a = process.argv.slice(2), o = Object.fromEntries(a.reduce((pairs, v, i) => i % 2 ? pairs : [...pairs, [v.replace(/^--/, ''), a[i + 1]]], []))
assert.equal(o.serial, 'emulator-5558'); assert.ok(o.output && /^[a-z-]+$/.test(o.case) && ['before','received','reviewed','kill','imported','removed','rejected','replayed','final'].includes(o.stage))
const app = 'com.longyuye.mdreader.mobile.dev', provider = 'com.longyuye.mdreader.storagefixture'
const run = (...args) => { const r = spawnSync('E:/Android/Sdk/platform-tools/adb.exe', ['-s', o.serial, ...args], { maxBuffer: 32 * 1024 * 1024 }); assert.equal(r.status, 0, r.stderr.toString()); return r.stdout }
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(), 'LongEdit_Compat_API29'); assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(), '29')
const json = b => JSON.parse(b.toString().replace(/^\ufeff/, '')), sha = b => createHash('sha256').update(b).digest('hex'), read = file => run('exec-out','run-as',app,'cat',file)
const files = folder => run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder) ? run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean) : []
const library = () => Object.fromEntries(files('library').sort().map(f => [f, sha(read(f))])), drafts = () => Object.fromEntries(files('drafts-v1').filter(f => f.endsWith('.json')).sort().map(f => { const { updated, ...d } = json(read(f)); return [f,d] }))
const records = folder => files(folder).filter(f => /\/[a-f0-9-]{36}\.json$/.test(f)).map(f => ({ ...json(read(f)), id: path.basename(f,'.json') }))
const packs = () => records('pack-imports-v1'), texts = () => records('text-imports-v1')
const reads = () => Object.fromEntries(run('exec-out','run-as',provider,'ls','files').toString().split(/\s+/).filter(f => /^pack-import-.*-reads\.txt$/.test(f)).map(f => [f,sha(run('exec-out','run-as',provider,'cat',`files/${f}`))]))
const sources = () => Object.fromEntries(run('exec-out','run-as',provider,'ls','files').toString().split(/\s+/).filter(f => /^pack-import-.*\.source$/.test(f)).map(f => [f,sha(run('exec-out','run-as',provider,'cat',`files/${f}`))]))
await mkdir(o.output,{recursive:true}); const save = result => writeFile(path.join(o.output,`${o.case}-${o.stage}.json`),JSON.stringify(result,null,2)+'\n'), load = stage => readFile(path.join(o.output,`${o.case}-${stage}.json`)).then(json)
const result = { kind:'native-system-pack-receiver', case:o.case, stage:o.stage, checkedAt:new Date().toISOString(), nativeAndroidTest:true, passed:false }
if (o.stage === 'before') { await save({ ...result, passed:true, library:library(), drafts:drafts(), packs:packs(), textIds:texts().map(r=>r.id), reads:reads(), sources:sources() }); console.log(`${o.case}: baseline captured`); process.exit(0) }
const baselineCase = o.baseline || o.case
assert.match(baselineCase,/^[a-z-]+$/)
const before = json(await readFile(path.join(o.output,`${baselineCase}-before.json`))), current = packs(), now = library(), currentDrafts = drafts()
result.baseline = `${baselineCase}-before.json`
for (const [file,digest] of Object.entries(before.library)) assert.equal(now[file],digest,'Previous library content unchanged: '+file)
for (const [file,draft] of Object.entries(before.drafts)) assert.deepEqual(currentDrafts[file],draft,'Previous protected draft unchanged: '+file)
for (const r of before.packs) { const retained = current.find(v=>v.id===r.id); assert.ok(retained,'Previous package record retained'); assert.equal(retained.archiveDigest,r.archiveDigest); assert.equal(retained.status,r.status); assert.equal(retained.incoming,r.incoming); if(r.archiveDigest)assert.equal(sha(read(`files/pack-imports-v1/${r.id}.zip`)),r.archiveDigest) }
const sourceNow=sources();for(const[file,digest]of Object.entries(before.sources||{}))assert.equal(sourceNow[file],digest,'Source package unchanged')
const producer=json(await readFile('E:/Android/BuildCache/LongEdit-PackImport-Valid-20261024/manifest.json'))
for(const[file,digest]of Object.entries(sourceNow))assert.equal(digest,producer[file.replace(/^pack-import-/,'').replace(/\.source$/,'')].sha256,'Source still matches independent producer')
assert.deepEqual(texts().map(r=>r.id).sort(),before.textIds.sort(),'Packages never become loose text imports')
const fresh = current.filter(r=>!before.packs.some(old=>old.id===r.id))
if (['rejected','replayed'].includes(o.stage)) {
  assert.equal(fresh.length,0); assert.deepEqual(now,before.library); assert.deepEqual(reads(),before.reads,'Rejected or replayed payload cannot reopen source')
  if(o.stage==='rejected') { const error=run('exec-out','run-as',app,'cat','shared_prefs/longedit-incoming-v1.xml').toString();assert.match(error,/name="error"/);if(o.message)assert.ok(error.includes(o.message));if(o.kind){assert.ok(['pack','text'].includes(o.kind));assert.ok(error.includes(`name="errorKind">${o.kind}</string>`))};result.explanation=error }
  if(o.stage==='replayed')assert.ok(o.id&&current.some(r=>r.id===o.id))
} else if (o.stage === 'removed') {
  const received = await load('received'); assert.ok(!current.some(r=>r.id===received.id)); assert.equal(fresh.length,0)
  if(o.committed==='yes'){ const imported=await load('imported');for(const[file,digest]of Object.entries(imported.published))assert.equal(now[file],digest,'Removing intake keeps published files') }
} else if (o.stage !== 'final') {
  assert.equal(fresh.length,1); const r=fresh[0]; result.id=r.id; result.status=r.status; result.incoming=r.incoming; result.source=r.source
  assert.ok(['open','share-file'].includes(r.source)); assert.equal(r.incoming,['received','kill'].includes(o.stage))
  const fixture = o.fixture || 'safe', manifest = json(await readFile('E:/Android/BuildCache/LongEdit-PackImport-Valid-20261024/manifest.json'))
  if(r.archiveDigest){ assert.equal(r.archiveDigest,manifest[fixture].sha256); assert.equal(sha(read(`files/pack-imports-v1/${r.id}.zip`)),r.archiveDigest); result.archiveDigest=r.archiveDigest }
  if(o.failed==='yes')assert.equal(r.status,'failed')
  else { assert.equal(r.status,o.stage==='imported'?'imported':'ready');assert.equal(r.count,3) }
  if(o.stage==='imported'){
    assert.ok(r.localPath); const note=read('files/library/'+r.localPath); assert.equal(note.toString(),manifest.expected.content+(fixture==='same'?'第二份同名笔记\r\n':''))
    const folder=r.localPath.split('/').slice(0,-1).join('/'), published={['files/library/'+r.localPath]:sha(note)}
    for(const[asset,expected]of Object.entries(manifest.expected.assets)){const file=`files/library/${folder}/${asset}`, bytes=read(file); assert.equal(bytes.length,expected.bytes);assert.equal(sha(bytes),expected.sha256);published[file]=sha(bytes)}
    result.localPath=r.localPath;result.published=published
  } else {assert.deepEqual(now,before.library); assert.ok(!Object.keys(now).some(f=>f.includes(r.id)))}
  if(o.stage==='kill'){ run('shell','am','force-stop',app);result.killedAfterArchiveVerification=true }
}
if(o.stage==='final'&&o.case==='baseline')assert.equal(fresh.length,0,'Every test intake was explicitly cleaned; previous packages remain')
result.protectedFiles=Object.keys(before.library).length;result.protectedDrafts=Object.keys(before.drafts).length
result.totalFiles=Object.keys(now).length;result.totalDrafts=Object.keys(currentDrafts).length;result.retainedPackages=current.length
result.installed=run('shell','dumpsys','package',app).toString().split(/\r?\n/).filter(line=>/versionCode=|versionName=/.test(line)).map(line=>line.trim())
result.passed=true;await save(result);console.log(`${o.case}/${o.stage}: passed`)
