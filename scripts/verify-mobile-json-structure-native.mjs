import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&['before','received','imported','changed','undone','redone','saved','reopened','exported','removed','final'].includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',provider='com.longyuye.mdreader.storagefixture'
const source=await readFile('tests/android-storage-provider/src/main/assets/json-source/json-source.json'),changed=Buffer.from(source.toString().replace('"same":-0','"same":123456789012345678901234567890e+9999'))
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,'')),read=f=>run('exec-out','run-as',app,'cat',f)
const files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const library=()=>Object.fromEntries(files('library').sort().map(f=>[f,sha(read(f))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]}))
const records=()=>files('text-imports-v1').filter(f=>f.endsWith('.json')).map(f=>({...json(read(f)),id:path.basename(f,'.json')})),packs=()=>Object.fromEntries(files('pack-imports-v1').map(f=>[f,sha(read(f))]))
await mkdir(o.output,{recursive:true});const load=stage=>readFile(path.join(o.output,`${stage}.json`)).then(json),save=r=>writeFile(path.join(o.output,`${o.stage}.json`),JSON.stringify(r,null,2)+'\n')
const result={kind:'mobile-json-structure-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){await save({...result,passed:true,library:library(),drafts:drafts(),imports:records(),packs:packs()});console.log('baseline captured');process.exit(0)}
const before=await load('before'),now=library(),all=records(),currentDrafts=drafts(),fresh=all.filter(r=>!before.imports.some(p=>p.id===r.id))
for(const[f,digest]of Object.entries(before.library))assert.equal(now[f],digest,'Prior file unchanged: '+f)
for(const[f,d]of Object.entries(before.drafts))assert.deepEqual(currentDrafts[f],d,'Prior draft content, signature and revision unchanged')
for(const r of before.imports)assert.deepEqual(all.find(v=>v.id===r.id),r,'Prior intake unchanged')
assert.deepEqual(packs(),before.packs,'All prior packages unchanged')
assert.equal(sha(run('exec-out','run-as',provider,'cat','files/json-source.source')),sha(source),'Synthetic source remains byte-identical')
if(o.stage==='received'){
 assert.equal(fresh.length,1);const r=fresh[0];assert.equal(r.digest,sha(source));assert.equal(r.content,source.toString());assert.equal(r.status,'ready');assert.equal(r.incoming,true);assert.deepEqual(now,before.library);assert.deepEqual(currentDrafts,before.drafts);result.id=r.id
}else{
 const received=await load('received')
 if(['removed','final'].includes(o.stage))assert.equal(fresh.length,0)
 else{assert.equal(fresh.length,1);assert.equal(fresh[0].id,received.id);assert.equal(fresh[0].status,'imported');assert.equal(fresh[0].incoming,false);result.localFile='files/library/'+fresh[0].localPath}
 const file=result.localFile||(await load('imported')).localFile,ownDraft=Object.values(currentDrafts).find(d=>'files/library/'+d.relativePath===file&&d.rootId==='local');result.localFile=file
 if(['changed','redone'].includes(o.stage)){assert.equal(now[file],sha(source));assert.ok(ownDraft);assert.equal(sha(Buffer.from(ownDraft.content)),sha(changed));assert.equal(ownDraft.expectedSignature,sha(source));result.draftRevision=ownDraft.revision}
 else{assert.equal(now[file],sha(['imported','undone'].includes(o.stage)?source:changed));assert.equal(ownDraft,undefined);assert.deepEqual(currentDrafts,before.drafts)}
 assert.equal(Object.keys(now).length,Object.keys(before.library).length+1)
 if(o.stage==='exported'){const target='/sdcard/Download/'+path.posix.basename(file,'.json')+'-导出副本.json';assert.equal(sha(run('exec-out','cat',target)),sha(changed));result.export=target;result.exportSha256=sha(changed)}
 result.sourceSha256=sha(source);result.expectedSha256=sha(changed);result.localSha256=now[file]
}
result.protectedFiles=Object.keys(before.library).length;result.totalFiles=Object.keys(now).length;result.protectedDrafts=Object.keys(before.drafts).length;result.protectedImports=before.imports.length;result.protectedPackageFiles=Object.keys(before.packs).length;result.passed=true;await save(result);console.log(`${o.stage}: passed`)
