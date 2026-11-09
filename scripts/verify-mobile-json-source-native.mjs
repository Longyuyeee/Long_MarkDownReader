import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&['baseline','normal','bad','open','text'].includes(o.case)&&['before','received','reviewed','imported','formatted','undone','redone','saved','reopened','exported','removed','final'].includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',provider='com.longyuye.mdreader.storagefixture',fixtures='tests/android-storage-provider/src/main/assets/json-source/'
const source=await readFile(fixtures+'json-source.json'),bad=await readFile(fixtures+'json-invalid.json'),formatted=Buffer.from('\uFEFF'+(await readFile('tests/fixtures/mobile-json-source-expected.json','utf8')).replace(/\r?\n/g,'\r\n'))
const text=Buffer.from('{"shared":900719925474099312345,"name":"中文😎"}\r\n'),expected=o.case==='bad'?bad:o.case==='text'?text:source
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,'')),read=f=>run('exec-out','run-as',app,'cat',f)
const files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const library=()=>Object.fromEntries(files('library').sort().map(f=>[f,sha(read(f))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]}))
const records=()=>files('text-imports-v1').filter(f=>f.endsWith('.json')).map(f=>({...json(read(f)),id:path.basename(f,'.json')})),packs=()=>Object.fromEntries(files('pack-imports-v1').map(f=>[f,sha(read(f))]))
await mkdir(o.output,{recursive:true});const load=stage=>readFile(path.join(o.output,`${o.case}-${stage}.json`)).then(json),save=r=>writeFile(path.join(o.output,`${o.case}-${o.stage}.json`),JSON.stringify(r,null,2)+'\n')
const result={kind:'mobile-json-source-native',case:o.case,stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){await save({...result,passed:true,library:library(),drafts:drafts(),imports:records(),packs:packs()});console.log(`${o.case}: baseline captured`);process.exit(0)}
const before=await load('before'),now=library(),all=records(),currentDrafts=drafts()
for(const[f,digest]of Object.entries(before.library))assert.equal(now[f],digest,'Prior library file unchanged: '+f)
for(const[f,d]of Object.entries(before.drafts))assert.deepEqual(currentDrafts[f],d,'Prior draft content, signature and revision unchanged')
for(const r of before.imports)assert.deepEqual(all.find(v=>v.id===r.id),r,'Prior intake unchanged')
assert.deepEqual(packs(),before.packs,'All prior packages unchanged')
const providerFiles=run('exec-out','run-as',provider,'ls','files').toString().split(/\s+/)
for(const[name,bytes]of [['json-source',source],['json-invalid',bad]])if(providerFiles.includes(name+'.source'))assert.equal(sha(run('exec-out','run-as',provider,'cat',`files/${name}.source`)),sha(bytes),'Synthetic file remains byte-identical')
const fresh=all.filter(r=>!before.imports.some(p=>p.id===r.id))
if(o.stage==='final'){
 assert.equal(fresh.length,0);assert.deepEqual(currentDrafts,before.drafts)
 for(const name of ['normal','bad']){const imported=json(await readFile(path.join(o.output,`${name}-imported.json`))),file=imported.localFile;assert.equal(now[file],sha(name==='normal'?formatted:bad))}
 assert.equal(Object.keys(now).length,Object.keys(before.library).length+2)
}else if(o.stage==='removed'){
 const received=await load('received');assert.equal(fresh.length,0);assert.ok(!all.some(r=>r.id===received.id))
 if(['normal','bad'].includes(o.case)){const imported=await load('imported');assert.equal(now[imported.localFile],sha(o.case==='normal'?formatted:bad));result.localFile=imported.localFile}
}else{
 assert.equal(fresh.length,1);const r=fresh[0];result.id=r.id;result.digest=r.digest;result.incoming=r.incoming;assert.equal(r.name.endsWith('.json'),true);assert.equal(r.source,o.case==='open'?'open':o.case==='text'?'share-text':'share-file');assert.equal(r.incoming,o.stage==='received');assert.equal(r.digest,sha(expected));assert.equal(r.bytes,expected.length)
 if(['received','reviewed'].includes(o.stage)){assert.equal(r.status,'ready');assert.equal(r.content,expected.toString());assert.deepEqual(now,before.library)}
 else{
  assert.equal(r.status,'imported');assert.equal(r.content,null);assert.ok(r.localPath.endsWith('.json'));const file='files/library/'+r.localPath,ownDraft=Object.values(currentDrafts).find(d=>d.rootId==='local'&&d.relativePath===r.localPath)
  result.localFile=file
  if(['formatted','redone'].includes(o.stage)){assert.equal(now[file],sha(source));assert.ok(ownDraft);assert.equal(sha(Buffer.from(ownDraft.content)),sha(formatted));assert.equal(ownDraft.expectedSignature,sha(source));assert.ok(Number.isInteger(ownDraft.revision)&&ownDraft.revision>0);result.draftRevision=ownDraft.revision}
  else if(['saved','reopened','exported'].includes(o.stage)){assert.equal(now[file],sha(formatted));assert.equal(ownDraft,undefined)}
  else{assert.equal(now[file],sha(expected));assert.equal(ownDraft,undefined)}
  result.localSha256=now[file]
  if(o.stage==='exported'){const target='/sdcard/Download/'+path.posix.basename(r.localPath,'.json')+'-导出副本.json';assert.equal(sha(run('exec-out','cat',target)),sha(formatted));result.export=target;result.exportSha256=sha(formatted)}
 }
}
result.protectedFiles=Object.keys(before.library).length;result.totalFiles=Object.keys(now).length;result.protectedDrafts=Object.keys(before.drafts).length;result.passed=true;await save(result);console.log(`${o.case}/${o.stage}: passed`)
