import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
const options=Object.fromEntries(process.argv.slice(2).reduce((pairs,value,index,values)=>index%2?pairs:[...pairs,[value.replace(/^--/,''),values[index+1]]],[]))
assert.equal(options.serial,'emulator-5558');assert.ok(options.output&&['before','ready','kill','imported','failed','removed','lose-receipt','edit-latest','latest','final'].includes(options.stage))
const app='com.longyuye.mdreader.mobile.dev',provider='com.longyuye.mdreader.storagefixture',scenario=options.case||'safe',stage=options.stage
const run=(...args)=>{const result=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',options.serial,...args],{maxBuffer:24*1024*1024});assert.equal(result.status,0,result.stderr.toString());return result.stdout}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),json=bytes=>JSON.parse(bytes.toString().replace(/^\ufeff/,'')),privateRead=file=>run('exec-out','run-as',app,'cat',file)
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const library=()=>Object.fromEntries(files('library').sort().map(file=>[file,sha(privateRead(file))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(file=>file.endsWith('.json')).sort().map(file=>{const {updated,...draft}=json(privateRead(file));return[file,draft]}))
const records=()=>files('pack-imports-v1').filter(file=>/\/[a-f0-9-]{36}\.json$/.test(file)).map(file=>json(privateRead(file)))
await mkdir(options.output,{recursive:true});const save=(name,value)=>writeFile(path.join(options.output,name+'.json'),JSON.stringify(value,null,2)+'\n'),load=name=>readFile(path.join(options.output,name+'.json')).then(json)
if(stage==='before'){await save('before',{library:library(),drafts:drafts(),priorIds:records().map(record=>record.id)});console.log('Baseline existing notes and all protected drafts recorded');process.exit(0)}
const before=await load('before'),now=library();for(const[file,digest]of Object.entries(before.library))assert.equal(now[file],digest,'Existing note/attachment unchanged: '+file);assert.deepEqual(drafts(),before.drafts)
const fixtureDir=process.env.LONGEDIT_PACK_IMPORT_FIXTURE||'E:/Android/BuildCache/LongEdit-PackImport-Valid-20261024',manifest=json(await readFile(path.join(fixtureDir,'manifest.json')))
const result={kind:'native-pack-import',scenario,stage,checkedAt:new Date().toISOString(),passed:false}
let record
if(stage==='ready'||stage==='failed'){
 const expected=manifest[scenario];assert.ok(expected);record=records().filter(record=>record.archiveDigest===expected.sha256||record.name===`pack-import-${scenario}.textpack`&&record.status==='failed').sort((a,b)=>b.created-a.created)[0]
 if(scenario==='wrongtype')record=records().find(record=>record.name==='Wrong.zip')
 assert.ok(record,'Actual package record must exist');result.id=record.id
}else if(!['final','removed'].includes(stage)){const prior=await load(scenario+'-ready');record=records().find(record=>record.id===prior.id);assert.ok(record);result.id=record.id}
if(record){
 if(record.archiveDigest){const bytes=privateRead(`files/pack-imports-v1/${record.id}.zip`);assert.equal(sha(bytes),record.archiveDigest);assert.equal(bytes.length,record.bytes);result.archiveSha256=record.archiveDigest;result.archiveBytes=bytes.length}
 const source=run('exec-out','run-as',provider,'cat',`files/pack-import-${scenario}.source`)
 assert.equal(sha(source),manifest[scenario].sha256,'Original provider package unchanged')
 if(stage==='ready'){
  assert.equal(record.status,'ready');assert.ok(!record.localPath);assert.ok(!Object.keys(now).some(file=>file.includes(record.id)),'Review must create no library folder')
  if(scenario==='safe')assert.deepEqual(now,before.library,'Initial review must create no library files')
  if(scenario!=='txt'){assert.equal(record.count,3);for(const asset of record.assets){const expected=manifest.expected.assets[asset.path];assert.ok(expected);assert.equal(asset.digest,expected.sha256);assert.equal(asset.bytes,expected.bytes)}}
 }
 if(stage==='kill'){
  assert.equal(record.status,'ready');run('shell','run-as',provider,'touch','files/pack-import-safe-offline');run('shell','am','force-stop',app);assert.equal(spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',options.serial,'shell','pidof',app]).status,1);assert.equal(sha(privateRead(`files/pack-imports-v1/${record.id}.zip`)),record.archiveDigest);result.processStoppedAfterCompleteStaging=true;result.sourceProviderMadeOffline=true
 }
 if(stage==='imported'||stage==='latest'||stage==='lose-receipt'){
  assert.equal(record.status,'imported');assert.ok(record.localPath.includes(record.id));const folder=record.localPath.split('/').slice(0,-1).join('/'),marker=json(privateRead(`files/library/${folder}/.longedit-pack-import.json`));assert.equal(marker.id,record.id);assert.equal(marker.archiveDigest,record.archiveDigest)
  const expected=stage==='latest'?'# NativeLater\r\n后来编辑。\n':scenario==='same'?manifest.expected.content+'第二份同名笔记\r\n':scenario==='txt'?'\ufeff纯文字😀\r\n保留 CR\r尾行\n![literal](missing.png)':manifest.expected.content
  const content=privateRead('files/library/'+record.localPath);assert.equal(content.toString(),expected);result.notePath=record.localPath;result.noteSha256=sha(content)
  for(const asset of record.assets)assert.equal(sha(privateRead(`files/library/${folder}/${asset.path}`)),asset.digest)
  result.assetsVerified=record.assets.length;result.noteFolders=Object.keys(now).filter(file=>file.endsWith('/.longedit-pack-import.json')).length
  if(stage==='lose-receipt'){
   record.status='ready';const bytes=Buffer.from(JSON.stringify(record)),write=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',options.serial,'exec-in','run-as',app,'tee',`files/pack-imports-v1/${record.id}.json`],{input:bytes});assert.equal(write.status,0);run('shell','am','force-stop',app);result.explicitFaultInjection='Reverted only the receipt to ready after verifying the complete published folder, modelling a process interruption between rename and receipt persistence.'
  }
 }
 if(stage==='failed'){
  if(scenario!=='missing')assert.equal(record.status,'failed');assert.ok(!record.localPath);assert.ok(!Object.keys(now).some(file=>file.includes(record.id)),'Invalid archive must publish no partial folder')
 }
 if(stage==='edit-latest'){
  assert.equal(scenario,'safe');assert.equal(record.status,'imported');assert.ok(record.localPath.includes(record.id));assert.ok(!before.library['files/library/'+record.localPath])
  const folder=record.localPath.split('/').slice(0,-1).join('/');assert.equal(json(privateRead(`files/library/${folder}/.longedit-pack-import.json`)).id,record.id)
  assert.equal(privateRead('files/library/'+record.localPath).toString(),manifest.expected.content)
  const bytes=Buffer.from('# NativeLater\r\n后来编辑。\n'),write=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',options.serial,'exec-in','run-as',app,'tee','files/library/'+record.localPath],{input:bytes});assert.equal(write.status,0);assert.equal(sha(privateRead('files/library/'+record.localPath)),sha(bytes));result.explicitFaultInjection='Changed only the owned synthetic imported note to model a later local edit; the protected source package and all earlier notes remain untouched.'
 }
}
if(['ready','imported','failed','latest','removed'].includes(stage)){
 run('shell','uiautomator','dump','/sdcard/longedit-pack-import-result.xml');const ui=run('exec-out','cat','/sdcard/longedit-pack-import-result.xml');await writeFile(path.join(options.output,`${scenario}-${stage}.xml`),ui)
 if(stage==='ready')assert.ok(ui.toString().includes('将笔记和附件存入手机资料库'))
 if(stage==='failed'){assert.ok(!ui.toString().includes('将笔记和附件存入手机资料库'));assert.ok(ui.toString().includes(scenario==='missing'?'缺少包内附件':'导入尚未完成'))}
 if(stage==='removed')assert.ok(ui.toString().includes('导入记录已移除'))
}
if(stage==='removed'){
 const prior=await load(scenario+'-imported'),ready=await load(scenario+'-ready');assert.ok(!records().some(record=>record.id===ready.id))
 assert.equal(sha(privateRead('files/library/'+prior.notePath)),prior.noteSha256);const folder=prior.notePath.split('/').slice(0,-1).join('/')
 for(const[asset,expected]of Object.entries(manifest.expected.assets))assert.equal(sha(privateRead(`files/library/${folder}/${asset}`)),expected.sha256)
 result.preservedNotePath=prior.notePath;result.preservedAssets=3
}
if(stage==='final'){
 for(const entry of records())if(entry.status==='imported'){
  assert.equal(sha(privateRead(`files/pack-imports-v1/${entry.id}.zip`)),entry.archiveDigest)
  const folder=entry.localPath.split('/').slice(0,-1).join('/');assert.equal(json(privateRead(`files/library/${folder}/.longedit-pack-import.json`)).id,entry.id)
  for(const asset of entry.assets)assert.equal(sha(privateRead(`files/library/${folder}/${asset.path}`)),asset.digest)
 }
 result.retainedImportedPackages=records().filter(entry=>entry.status==='imported').length
}
const build=json(await readFile('release-artifacts/mobile-debug/x86_64/build-record.json'));assert.equal(build.verification.versionCode,1002021);const apk=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');result.installedApkSha256=run('shell','sha256sum',apk).toString().trim().split(/\s+/)[0];assert.equal(result.installedApkSha256,build.sha256)
assert.match(run('shell','dumpsys','connectivity').toString(),/Active default network: none/);result.existingLibraryFiles=Object.keys(before.library).length;result.protectedDrafts=Object.keys(before.drafts).length;result.passed=true;result.scope='Dedicated API29 / WebView124 emulator, synthetic sources and controlled provider; no physical-phone, real-cloud or competitor-app round-trip claim.'
await save(scenario+'-'+stage,result);console.log(`${scenario} ${stage}: exact source, note/asset bytes, prior notes/drafts and installed package verified`)
