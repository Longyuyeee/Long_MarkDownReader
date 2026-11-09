import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args=process.argv.slice(2), options=Object.fromEntries(args.reduce((out,value,i)=>{if(i%2===0)out.push([value.replace(/^--/,''),args[i+1]]);return out},[]))
assert.ok(options.serial && options.output && ['safe','same','txt','invalid','large','offline','wrongtype','cancel'].includes(options.case) && ['before','ready','kill','imported','reopened','failed','removed','cancelled','final'].includes(options.stage),'Required: --serial --output --case safe|same|txt|invalid|large|offline|wrongtype|cancel --stage before|ready|kill|imported|reopened|failed|removed|cancelled|final')
const app='com.longyuye.mdreader.mobile.dev',provider='com.longyuye.mdreader.storagefixture'
const run=(...args)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',options.serial,...args],{maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),json=bytes=>JSON.parse(bytes.toString().replace(/^\ufeff/,''))
const files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder) ? run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean) : []
const read=file=>run('exec-out','run-as',app,'cat',file)
const hashes=folder=>Object.fromEntries(files(folder).map(file=>[file,sha(read(file))]))
const records=()=>files('text-imports-v1').filter(file=>file.endsWith('.json')).map(file=>({...json(read(file)),id:path.basename(file,'.json')}))
const save=async(stage,result)=>writeFile(path.join(options.output,`${options.case}-${stage}.json`),JSON.stringify(result,null,2)+'\n')
const load=async stage=>json(await readFile(path.join(options.output,`${options.case}-${stage}.json`)))
await mkdir(options.output,{recursive:true})
const readAttempts=()=>run('exec-out','run-as',provider,'ls','files').toString().split(/\s+/).includes(`import-${options.case}-reads.txt`) ? run('exec-out','run-as',provider,'cat',`files/import-${options.case}-reads.txt`).toString().trim().split(/\r?\n/).filter(Boolean).length : 0
const stage=options.stage,scenario=options.case, result={scenario,stage,serial:options.serial,time:new Date().toISOString(),nativeAndroidTest:true}
if(stage==='before'){Object.assign(result,{priorReadAttempts:readAttempts(),priorIds:records().map(record=>record.id),priorNotes:hashes('library'),priorDrafts:hashes('drafts-v1')});await save(stage,result);console.log(`${scenario}: baseline captured`);process.exit(0)}
const before=await load('before'),all=records()
const finalReference=['final','removed','reopened'].includes(stage) && scenario!=='cancel' ? await load(['invalid','large','offline','wrongtype'].includes(scenario)?'failed':'imported') : null
const current=all.filter(record=>finalReference ? record.id===finalReference.importId : !before.priorIds.includes(record.id))
for(const id of before.priorIds)assert.ok(all.some(record=>record.id===id),'Earlier import records retained')
for(const [file,hash] of Object.entries(before.priorNotes))assert.equal(sha(read(file)),hash,'Earlier local note unchanged')
assert.deepEqual(hashes('drafts-v1'),before.priorDrafts,'Existing private drafts unchanged')
const expectedText='\ufeff# Import 中文😀\r\n首行\r尾行\n![图](images/a.png)\r\n'+(scenario==='same'?'第二份同名内容\r\n':'')
const fixturePath=`files/import-${scenario}.source`
const verifySource=()=>{const bytes=run('exec-out','run-as',provider,'cat',fixturePath);const expected=scenario==='invalid'?Buffer.from([255,254,65,0]):scenario==='large'?Buffer.alloc(4*1024*1024+1,65):Buffer.from(expectedText);assert.deepEqual(bytes,expected,'Synthetic source remains byte-identical');result.sourceSha256=sha(bytes);result.sourceBytes=bytes.length}
if(scenario!=='cancel')verifySource()
if(stage==='cancelled'||scenario==='cancel'&&stage==='final'){assert.equal(current.length,0);assert.deepEqual(hashes('library'),before.priorNotes)}
else if(stage==='removed'){
  const imported=await load('imported');assert.equal(current.length,0);assert.equal(sha(read(imported.localFile)),sha(expectedText));result.localFile=imported.localFile
}else{
  assert.equal(current.length,1);const record=current[0];result.importId=record.id;result.status=record.status
  if(['ready','kill'].includes(stage)){
    assert.equal(record.status,'ready');assert.equal(record.content,expectedText);assert.equal(record.digest,sha(expectedText));assert.equal(record.bytes,Buffer.byteLength(expectedText));assert.deepEqual(hashes('library'),before.priorNotes)
    result.fullCandidateSha256=record.digest;await save('protected',result)
    if(stage==='kill'){run('shell','am','force-stop',app);const stopped=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',options.serial,'shell','pidof',app]);assert.equal(stopped.status,1);assert.equal(records().find(item=>item.id===record.id).content,expectedText);result.processTerminatedAfterFullSnapshot=true}
  }else if(stage==='failed'||stage==='final'&&['invalid','large','offline','wrongtype'].includes(scenario)){
    assert.equal(record.status,'failed');assert.equal(record.content,null);assert.ok(record.error);if(stage!=='final')assert.deepEqual(hashes('library'),before.priorNotes);result.error=record.error
  }else{
    assert.equal(record.status,'imported');assert.equal(record.content,null);assert.equal(record.digest,sha(expectedText));assert.ok(record.localPath&&!record.localPath.includes('/'))
    const localFile=`files/library/${record.localPath}`;assert.equal(sha(read(localFile)),record.digest);if(stage!=='final')assert.equal(Object.keys(hashes('library')).length,Object.keys(before.priorNotes).length+1);result.localFile=localFile;result.localSha256=record.digest
  }
  const attemptCount=readAttempts();result.providerReadAttempts=attemptCount
  if(scenario==='safe')assert.equal(attemptCount-before.priorReadAttempts,1,'Commit/restart cannot reopen the provider')
}
if(stage==='final'){
  const build=json(await readFile('release-artifacts/mobile-debug/x86_64/build-record.json'));assert.equal(build.verification.versionCode,1002018)
  const apk=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');result.installedApkSha256=run('shell','sha256sum',apk).toString().trim().split(/\s+/)[0];assert.equal(result.installedApkSha256,build.sha256)
  assert.match(run('shell','dumpsys','connectivity').toString(),/Active default network: none/)
}
result.passed=true;result.scope='Owned API 29 emulator, WebView 124, actual system picker and separate synthetic read-only DocumentsProvider; no physical phone or cloud provider claim.'
await save(stage,result);console.log(`${scenario} ${stage}: source, private intake, local notes and drafts verified`)
