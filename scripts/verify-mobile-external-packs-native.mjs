import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir,readFile,writeFile } from 'node:fs/promises'
import path from 'node:path'
const a=process.argv.slice(2),o=Object.fromEntries(a.reduce((p,v,i)=>i%2?p:[...p,[v.replace(/^--/,''),a[i+1]]],[]))
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&['baseline','shiny','fsnotes','open','generic','multi','missing'].includes(o.case)&&['before','received','reviewed','imported','removed','final'].includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',provider='com.longyuye.mdreader.storagefixture',root='tests/fixtures/mobile-external-packs',corpus=JSON.parse(await readFile(root+'/manifest.json','utf8'))
const source={shiny:'shinyfrog-v2.textpack',open:'shinyfrog-v2.textpack',fsnotes:'fsnotes-ios.textpack',generic:'not-a-bundle.zip',multi:'multiple-notes.zip',missing:'missing-assets.zip'}
const run=(...args)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...args],{maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\ufeff/,'')),read=file=>run('exec-out','run-as',app,'cat',file)
const files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const library=()=>Object.fromEntries(files('library').sort().map(f=>[f,sha(read(f))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]})),records=()=>files('pack-imports-v1').filter(f=>/\/[a-f0-9-]{36}\.json$/.test(f)).map(f=>json(read(f)))
const sourceFiles=()=>Object.fromEntries(run('exec-out','run-as',provider,'ls','files').toString().split(/\s+/).filter(f=>/^external-.*\.source$/.test(f)).map(f=>[f,sha(run('exec-out','run-as',provider,'cat',`files/${f}`))]))
await mkdir(o.output,{recursive:true});const load=stage=>readFile(path.join(o.output,`${o.case}-${stage}.json`)).then(json),save=r=>writeFile(path.join(o.output,`${o.case}-${o.stage}.json`),JSON.stringify(r,null,2)+'\n')
const result={kind:'native-public-note-package-compatibility',case:o.case,stage:o.stage,time:new Date().toISOString(),passed:false,nativeAndroidTest:true}
if(o.stage==='before'){await save({...result,passed:true,library:library(),drafts:drafts(),packs:records(),sources:sourceFiles()});console.log(`${o.case}: baseline captured`);process.exit(0)}
const before=await load('before'),now=library(),current=records(),currentDrafts=drafts()
for(const[f,digest]of Object.entries(before.library))assert.equal(now[f],digest,'Earlier library file unchanged: '+f)
assert.deepEqual(currentDrafts,before.drafts,'Every prior draft retains content, revision and signature')
for(const prior of before.packs){const r=current.find(r=>r.id===prior.id);assert.deepEqual(r,prior,'Earlier intake metadata unchanged');if(r.archiveDigest)assert.equal(sha(read(`files/pack-imports-v1/${r.id}.zip`)),r.archiveDigest)}
const sources=sourceFiles();for(const[f,digest]of Object.entries(before.sources))assert.equal(sources[f],digest,'Public source unchanged')
for(const[f,digest]of Object.entries(sources)){const key=f.replace(/^external-/,'').replace(/\.source$/,'');assert.equal(digest,corpus.samples[source[key]].sha256,'Fixture matches pinned public corpus')}
const fresh=current.filter(r=>!before.packs.some(p=>p.id===r.id))
if(o.stage==='final'){
 assert.equal(fresh.length,0)
 for(const name of ['shiny','fsnotes']){const imported=json(await readFile(path.join(o.output,`${name}-imported.json`)));for(const[f,digest]of Object.entries(imported.published))assert.equal(now[f],digest,'Published public sample remains intact')}
 assert.equal(Object.keys(now).length,Object.keys(before.library).length+6,'Only two notes, two images and two ownership markers added')
}
else if(o.stage==='removed'){const received=await load('received');assert.ok(!current.some(r=>r.id===received.id));assert.equal(fresh.length,0);if(['shiny','fsnotes'].includes(o.case)){const imported=await load('imported');for(const[f,digest]of Object.entries(imported.published))assert.equal(now[f],digest)}}
else{
 assert.equal(fresh.length,1);const r=fresh[0],expected=corpus.samples[source[o.case]];result.id=r.id;result.archiveDigest=r.archiveDigest;result.backendStatus=r.status;result.incoming=r.incoming
 assert.equal(r.archiveDigest,expected.sha256);assert.equal(sha(read(`files/pack-imports-v1/${r.id}.zip`)),expected.sha256);assert.ok(r.name.endsWith('.zip'));assert.equal(r.incoming,o.stage==='received');assert.equal(r.source,o.case==='open'?'open':'share-file')
 const rejected=['generic','multi'].includes(o.case);assert.equal(r.status,rejected?'failed':o.stage==='imported'?'imported':'ready')
 if(o.stage==='imported'){
   assert.ok(r.localPath);const prefix=r.localPath.split('/').slice(0,-1).join('/'),members=expected.members,text=Object.entries(members).find(([name])=>name.endsWith('/text.markdown')),published={}
   const expectedName=o.case==='shiny'?'公开示例.md':'FSNotes笔记.md';assert.equal(path.posix.basename(r.localPath),expectedName)
   const note='files/library/'+r.localPath;assert.equal(sha(read(note)),text[1].sha256);published[note]=text[1].sha256
   for(const[name,member]of Object.entries(members).filter(([name])=>name.includes('/assets/'))){const asset=name.slice(name.indexOf('assets/')),file=`files/library/${prefix}/${asset}`;assert.equal(sha(read(file)),member.sha256);published[file]=member.sha256}
   result.published=published;result.localPath=r.localPath
 }else{assert.deepEqual(now,before.library);assert.ok(!r.localPath);assert.ok(!Object.keys(now).some(f=>f.includes(r.id)))}
 if(o.case==='missing'){assert.equal(r.count,0);result.referenceValidation='Native ZIP structurally retained; shared adapter must block missing references in actual UI'}
}
result.protectedFiles=Object.keys(before.library).length;result.protectedDrafts=Object.keys(before.drafts).length;result.totalFiles=Object.keys(now).length;result.retainedPackages=current.length;result.passed=true;await save(result);console.log(`${o.case}/${o.stage}: passed`)
