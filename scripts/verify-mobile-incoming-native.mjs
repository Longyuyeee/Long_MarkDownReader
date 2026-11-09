import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((out,v,i)=>{if(i%2===0)out.push([v.replace(/^--/,''),args[i+1]]);return out},[]))
assert.ok(o.serial&&o.output&&['cold','fresh','file','clip','text','invalid','large','offline','wrongtype','nogrant','web','multiple','replay'].includes(o.case)&&['before','received','kill','committed','replayed','rejected','final'].includes(o.stage),'Explicit serial, output, case and stage required')
const app='com.longyuye.mdreader.mobile.dev',provider='com.longyuye.mdreader.storagefixture'
const run=(...args)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...args],{maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\ufeff/,'')),files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[],read=file=>run('exec-out','run-as',app,'cat',file)
const notes=()=>Object.fromEntries(files('library').map(file=>[file,sha(read(file))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(file=>file.endsWith('.json')).map(file=>{const{updated,...d}=json(read(file));return[file,d]})),records=()=>files('text-imports-v1').filter(file=>file.endsWith('.json')).map(file=>({...json(read(file)),id:path.basename(file,'.json')}))
const providerReads=()=>Object.fromEntries(run('exec-out','run-as',provider,'ls','files').toString().split(/\s+/).filter(name=>/^incoming-.*-reads\.txt$/.test(name)).map(name=>[name,sha(run('exec-out','run-as',provider,'cat',`files/${name}`))]))
const output=path.join(o.output,`${o.case}-${o.stage}.json`),load=async stage=>json(await readFile(path.join(o.output,`${o.case}-${stage}.json`)))
await mkdir(o.output,{recursive:true});const result={case:o.case,stage:o.stage,serial:o.serial,nativeAndroidTest:true,time:new Date().toISOString()}
if(o.stage==='before'){Object.assign(result,{priorIds:records().map(r=>r.id),notes:notes(),drafts:drafts(),providerReads:providerReads()});await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(`${o.case}: baseline captured`);process.exit(0)}
const before=await load('before'),all=records(),reference=o.stage==='final'?await load(['web','multiple','nogrant'].includes(o.case)?'rejected':o.case==='replay'?'replayed':'received'):null,current=all.filter(r=>reference?.importId?r.id===reference.importId:!before.priorIds.includes(r.id))
for(const id of before.priorIds)assert.ok(all.some(r=>r.id===id),'Earlier intake records remain')
for(const[file,hash]of Object.entries(before.notes))assert.equal(sha(read(file)),hash,'Earlier local notes unchanged')
const currentDrafts=drafts();for(const[file,draft]of Object.entries(before.drafts))assert.deepEqual(currentDrafts[file],draft,'Existing drafts retain full text, revision and expected signature');if(o.stage!=='final')assert.deepEqual(currentDrafts,before.drafts)
const text='分享中文😀\r\n下一行\nhttps://example.invalid/shared?keep=1\r\n',file='\ufeff# Incoming 中文😀\r\n首行\r尾行\n![图](images/a.png)\r\n',expected=o.case==='text'?text:file
const rejects=['web','multiple','nogrant'].includes(o.case)
if(o.case==='replay'){assert.deepEqual(providerReads(),before.providerReads,'Replaying a delivery cannot reopen its source');assert.equal(current.length,0);assert.deepEqual(notes(),before.notes);result.replayedDeliveryId=o.id;assert.ok(o.id&&all.some(r=>r.id===o.id))}
else if(rejects){assert.equal(current.length,0);if(o.stage!=='final')assert.deepEqual(notes(),before.notes);const prefs=run('exec-out','run-as',app,'cat','shared_prefs/longedit-incoming-v1.xml').toString();assert.match(prefs,/name="error"/);result.errorRecorded=true}
else{
 assert.equal(current.length,1);const r=current[0];result.importId=r.id;result.status=r.status
 const failed=['invalid','large','offline','wrongtype'].includes(o.case)
 assert.equal(r.status,failed?'failed':['committed','final'].includes(o.stage)&&o.case==='cold'?'imported':'ready')
 if(failed){assert.equal(r.content,null);assert.ok(r.error);result.error=r.error}
 else if(r.status==='ready'){assert.equal(r.content,expected);assert.equal(r.bytes,Buffer.byteLength(expected));assert.equal(r.digest,sha(expected));result.contentSha256=r.digest;if(o.stage!=='final')assert.deepEqual(notes(),before.notes)}
 else{assert.equal(r.content,null);assert.equal(sha(read(`files/library/${r.localPath}`)),sha(expected));result.localPath=r.localPath;result.contentSha256=r.digest}
 assert.equal(r.source,o.case==='text'?'share-text':['cold','fresh'].includes(o.case)?'open':'share-file')
 if(o.case!=='text'){
  const root=o.case==='file'||o.case==='cold'?'good':o.case,source=run('exec-out','run-as',provider,'cat',`files/incoming-${root}.source`),bytes=o.case==='invalid'?Buffer.from([255,254,65,0]):o.case==='large'?Buffer.alloc(4*1024*1024+1,65):Buffer.from(file)
  assert.deepEqual(source,bytes,'Read-only synthetic source remains exact');result.sourceSha256=sha(source)
 }
 if(o.stage==='kill'){assert.equal(r.status,'ready');run('shell','am','force-stop',app);const p=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,'shell','pidof',app]);assert.equal(p.status,1);assert.equal(records().find(v=>v.id===r.id).content,expected);result.terminatedAfterFullSnapshot=true}
}
if(o.stage==='final'){const build=json(await readFile('release-artifacts/mobile-debug/x86_64/build-record.json'));assert.equal(build.verification.versionCode,1002019);const apk=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');result.installedApkSha256=run('shell','sha256sum',apk).toString().trim().split(/\s+/)[0];assert.equal(result.installedApkSha256,build.sha256);assert.match(run('shell','dumpsys','connectivity').toString(),/Active default network: none/)}
result.passed=true;result.scope='Dedicated API 29 emulator / WebView 124; real cross-app Intent and temporary URI grant from synthetic sender; no physical phone or real cloud provider claim.'
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(`${o.case} ${o.stage}: incoming payload, notes and draft verified`)
