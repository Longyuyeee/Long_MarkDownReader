import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
const rustStages=['before','received','imported','located','changed','undone','redone','saved','navigated','exported','reopened','removed','final']
const stages=[...rustStages,'vue-received','vue-imported','vue-exported','vue-removed','sql-received','sql-imported','sql-removed','complete']
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&stages.includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',provider='com.longyuye.mdreader.storagefixture'
const rust=await readFile('tests/android-storage-provider/src/main/assets/code-languages/code-rust.rs'),vue=await readFile('tests/android-storage-provider/src/main/assets/code-languages/code-vue.vue'),sql=Buffer.from("-- 合成 SQL😎\r\nSELECT '你好' AS name;\n")
const original=rust.toString(),changed=original.replace('fn greet()', '  fn greet()')
assert.equal(original.split('fn greet()').length,2);assert.notEqual(changed,original)
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{maxBuffer:32*1024*1024,timeout:30000});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,'')),read=f=>run('exec-out','run-as',app,'cat',f)
const files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const library=()=>Object.fromEntries(files('library').sort().map(f=>[f,sha(read(f))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]})),records=()=>files('text-imports-v1').filter(f=>f.endsWith('.json')).map(f=>({...json(read(f)),id:path.basename(f,'.json')})),packs=()=>Object.fromEntries(files('pack-imports-v1').map(f=>[f,sha(read(f))]))
await mkdir(o.output,{recursive:true});const load=stage=>readFile(path.join(o.output,`${stage}.json`)).then(json),save=r=>writeFile(path.join(o.output,`${o.stage}.json`),JSON.stringify(r,null,2)+'\n')
const result={kind:'mobile-code-languages-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){await save({...result,passed:true,library:library(),drafts:drafts(),imports:records(),packs:packs()});console.log('baseline captured');process.exit(0)}
const before=await load('before'),now=library(),all=records(),currentDrafts=drafts(),fresh=all.filter(r=>!before.imports.some(p=>p.id===r.id))
for(const[f,digest]of Object.entries(before.library))assert.equal(now[f],digest,'Prior source unchanged: '+f)
for(const[f,d]of Object.entries(before.drafts))assert.deepEqual(currentDrafts[f],d,'Prior draft unchanged')
for(const r of before.imports)assert.deepEqual(all.find(v=>v.id===r.id),r,'Prior intake unchanged')
assert.deepEqual(packs(),before.packs,'Prior packages unchanged');assert.equal(sha(run('exec-out','run-as',provider,'cat','files/code-rust.source')),sha(rust),'Readonly Rust source unchanged')
const baselineCount=Object.keys(before.library).length
if(rustStages.includes(o.stage)){
 if(o.stage==='received'){assert.equal(fresh.length,1);const r=fresh[0];assert.equal(r.name,'MobileRust.rs');assert.equal(r.source,'share-file');assert.equal(r.digest,sha(rust));assert.equal(r.content,original);assert.equal(r.status,'ready');assert.equal(r.incoming,true);assert.deepEqual(now,before.library);assert.deepEqual(currentDrafts,before.drafts);result.id=r.id}
 else{
  const received=await load('received');if(['removed','final'].includes(o.stage))assert.equal(fresh.length,0);else{assert.equal(fresh.length,1);assert.equal(fresh[0].id,received.id);assert.equal(fresh[0].status,'imported');assert.equal(fresh[0].incoming,false);result.localFile='files/library/'+fresh[0].localPath}
  const file=result.localFile||(await load('imported')).localFile,ownDraft=Object.values(currentDrafts).find(d=>'files/library/'+d.relativePath===file&&d.rootId==='local');result.localFile=file;assert.match(file,/\.rs$/)
  if(['changed','redone'].includes(o.stage)){assert.equal(now[file],sha(rust));assert.ok(ownDraft);assert.equal(sha(Buffer.from(ownDraft.content)),sha(Buffer.from(changed)));assert.equal(ownDraft.expectedSignature,sha(rust));result.draftRevision=ownDraft.revision;result.draftSha256=sha(Buffer.from(ownDraft.content))}
  else{assert.equal(now[file],sha(['imported','located','undone'].includes(o.stage)?rust:Buffer.from(changed)));assert.equal(ownDraft,undefined);assert.deepEqual(currentDrafts,before.drafts)}
  assert.equal(Object.keys(now).length,baselineCount+1)
  if(o.stage==='exported'){const target='/sdcard/Download/'+path.posix.basename(file,'.rs')+'-导出副本.rs';assert.equal(sha(run('exec-out','cat',target)),sha(Buffer.from(changed)));result.export=target;result.exportSha256=sha(Buffer.from(changed))}
  result.sourceSha256=sha(rust);result.expectedSha256=sha(Buffer.from(changed));result.localSha256=now[file]
 }
}else{
 const rustFile=(await load('imported')).localFile;assert.equal(now[rustFile],sha(Buffer.from(changed)));assert.deepEqual(currentDrafts,before.drafts)
 assert.equal(sha(run('exec-out','run-as',provider,'cat','files/code-vue.source')),sha(vue),'Readonly Vue source unchanged')
 const isVue=o.stage.startsWith('vue-'),receivedStage=isVue?'vue-received':'sql-received',source=isVue?vue:sql,name=isVue?'MobileComponent.vue':'分享源码.sql',ext=isVue?'vue':'sql'
 if(!isVue){const vueFile=(await load('vue-imported')).localFile;assert.equal(now[vueFile],sha(vue))}
 const received=o.stage.endsWith('-received'),removed=o.stage.endsWith('-removed')||o.stage==='complete'
 if(received){assert.equal(fresh.length,1);const r=fresh[0];assert.equal(r.name,name);assert.equal(r.source,isVue?'open':'share-text');assert.equal(r.content,source.toString());assert.equal(r.digest,sha(source));assert.equal(r.status,'ready');assert.equal(r.incoming,true);result.id=r.id}
 else if(removed)assert.equal(fresh.length,0)
 else{const intake=await load(receivedStage);assert.equal(fresh.length,1);assert.equal(fresh[0].id,intake.id);assert.equal(fresh[0].status,'imported');assert.equal(fresh[0].incoming,false)}
 if(!received){const file=removed?(await load(isVue?'vue-imported':'sql-imported')).localFile:'files/library/'+fresh[0].localPath;assert.match(file,new RegExp('\\.'+ext+'$'));assert.equal(now[file],sha(source));result.localFile=file;result.localSha256=now[file]}
 const added=isVue?(received?1:2):(received?2:3);assert.equal(Object.keys(now).length,baselineCount+added)
 if(o.stage==='vue-exported'){const target='/sdcard/Download/'+path.posix.basename(result.localFile,'.vue')+'-导出副本.vue';assert.equal(sha(run('exec-out','cat',target)),sha(vue));result.export=target;result.exportSha256=sha(vue)}
}
result.protectedFiles=baselineCount;result.totalFiles=Object.keys(now).length;result.protectedDrafts=Object.keys(before.drafts).length;result.protectedImports=before.imports.length;result.protectedPackageFiles=Object.keys(before.packs).length;result.passed=true;await save(result);console.log(`${o.stage}: passed`)
if(o.stage==='final'||o.stage==='complete'){
 const phaseResults=await Promise.all((o.stage==='final'?rustStages:stages).map(load));assert.ok(phaseResults.every(r=>r.passed))
 const build=json(await readFile(path.join(o.output,'build-x86_64.json'))),fixtureApk=await readFile('tests/android-storage-provider/build/outputs/apk/debug/longedit-storage-fixture-debug.apk')
 const installedDigest=packageName=>{const file=run('shell','pm','path',packageName).toString().trim().replace(/^package:/,'');assert.match(file,/^\/data\/app\/[^\r\n]+\/base\.apk$/);return run('shell','sha256sum',file).toString().trim().split(/\s+/)[0]}
 const installedApkSha256=installedDigest(app),fixtureApkSha256=installedDigest(provider);assert.equal(installedApkSha256,build.sha256);assert.equal(fixtureApkSha256,sha(fixtureApk))
 await writeFile(path.join(o.output,'webview.txt'),run('shell','dumpsys','webviewupdate').toString())
 const summary={kind:'mobile-code-languages-native',nativeAndroidTest:true,passed:true,serial:o.serial,avd:'LongEdit_Compat_API29',sdk:29,abi:run('shell','getprop','ro.product.cpu.abi').toString().trim(),memory:run('shell','cat','/proc/meminfo').toString().split(/\r?\n/).find(v=>v.startsWith('MemTotal:')),installedApkSha256,fixtureApkSha256,stages:phaseResults.map(r=>({stage:r.stage,passed:r.passed})),protectedFiles:baselineCount,totalFiles:result.totalFiles,protectedDrafts:result.protectedDrafts,protectedImports:result.protectedImports,protectedPackageFiles:result.protectedPackageFiles,rustSourceSha256:sha(rust),rustExpectedSha256:sha(Buffer.from(changed)),vueSourceSha256:sha(vue),sqlSourceSha256:sha(sql),scope:'Synthetic API29 emulator. Real Rust share URI, format information/back, line edits, undo/redo, explicit save, DocumentsUI export/readback and restart; Vue source VIEW/import/export; SQL typed text share/import. Named native Button actions with an active/focused application-window fallback, physical line-tool/system taps, explicit keyboard handling and independent byte checks. Null-root, stale-coordinate and accessibility selection issues are recorded in test-harness-notes.md. No all-MIME real-app coverage, physical device, iOS or full TalkBack touch claim.'}
 await writeFile(path.join(o.output,o.stage==='final'?'rust-summary.json':'summary.json'),JSON.stringify(summary,null,2)+'\n')
}
