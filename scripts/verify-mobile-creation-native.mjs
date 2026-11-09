import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args=process.argv.slice(2), options=Object.fromEntries(args.reduce((out,value,i)=>{if(i%2===0)out.push([value.replace(/^--/,''),args[i+1]]);return out},[]))
const cases={'create-safe':['CreateSafe.md','CreationSafeDraft'],'create-renamed':['CreateRenamed.md','CreationRenameDraft'],'create-alias':['CreateAlias.md','CreationAliasDraft']}
assert.ok(options.serial && options.output && cases[options.scenario] && ['before','prepared','failed','saved','final'].includes(options.stage),'Required: --serial --output --scenario create-safe|create-renamed|create-alias --stage before|prepared|failed|saved|final')
const run=(...args)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',options.serial,...args],{maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const app='com.longyuye.mdreader.mobile.dev', provider='com.longyuye.mdreader.storagefixture', scenario=options.scenario, [relativePath,content]=cases[scenario]
const original='# Existing original\r\n\r\n已有中文😀必须保留。\r\n', sha=value=>createHash('sha256').update(value).digest('hex')
const jsonFile=async name=>JSON.parse((await readFile(path.join(options.output,name),'utf8')).replace(/^\uFEFF/,''))
const prefs=run('exec-out','run-as',app,'cat','shared_prefs/longedit-mobile-roots-v1.xml').toString()
const root=[...prefs.matchAll(/<string name="([a-f0-9]{64})">([^<]+)<\/string>/g)].find(([, ,uri])=>uri.endsWith(`/tree/${scenario}`));assert.ok(root,'Authorize the exact scenario through the system picker first')
const rootId=root[1], draftPath=`files/drafts-v1/${sha(`${rootId}\n${relativePath}`)}.json`
const appFiles=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find',`files/${folder}`,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const recoveries=()=>appFiles('write-recovery').filter(file=>/\/[a-f0-9-]{36}\.json$/.test(file)).map(file=>{const bytes=run('exec-out','run-as',app,'cat',file);return{...JSON.parse(bytes),id:file.split('/').pop().replace('.json',''),privateSha256:sha(bytes)}}).filter(record=>record.rootId===rootId && record.relativePath===relativePath)
const providerFiles=()=>run('exec-out','run-as',provider,'ls',`files/${scenario}`).toString().trim().split(/\s+/).filter(Boolean)
const audit=()=>run('exec-out','run-as',provider,'ls','files').toString().split(/\s+/).includes(`${scenario}-writes.txt`)?run('exec-out','run-as',provider,'cat',`files/${scenario}-writes.txt`).toString().trim().split(/\r?\n/).filter(Boolean):[]
const source=()=>run('exec-out','run-as',provider,'cat',`files/${scenario}/${relativePath}`)
assert.equal(run('exec-out','run-as',provider,'cat',`files/${scenario}/Existing.md`).toString(),original,'Existing file must never be changed')
await mkdir(options.output,{recursive:true})
const save=(name,data)=>writeFile(path.join(options.output,name),JSON.stringify(data,null,2)+'\n')
const result={kind:'controlled-native-creation',checkedAt:new Date().toISOString(),scenario,stage:options.stage,rootId,relativePath,contentSha256:sha(content),existingSha256:sha(original)}
if(options.stage==='before'){
  assert.deepEqual(providerFiles(),['Existing.md']);assert.deepEqual(audit(),[])
  result.priorRecoveryIds=recoveries().map(record=>record.id);result.priorCopies=appFiles('library')
  await save(`${scenario}-before.json`,result);console.log(`${scenario}: clean synthetic source verified`);process.exit(0)
}
const before=await jsonFile(`${scenario}-before.json`)
if(options.stage==='prepared'){
  const draft=JSON.parse(run('exec-out','run-as',app,'cat',draftPath));assert.equal(draft.content,content);assert.equal(draft.expectedSignature,null)
  assert.ok((await readFile(path.join(options.output,`${scenario}-prepared.xml`),'utf8')).includes(content))
  result.completeDraftVerifiedBeforeSave=true;result.passed=true;await save(`${scenario}-prepared.json`,result);console.log(`${scenario}: complete private candidate verified before save`);process.exit(0)
}
if(scenario==='create-safe'){
  assert.deepEqual(providerFiles().sort(),['Existing.md',relativePath].sort());assert.equal(source().toString(),content)
  assert.deepEqual(audit(),[`${scenario}/${relativePath}`]);assert.equal(appFiles('drafts-v1').includes(draftPath),false)
  assert.equal(recoveries().filter(record=>!before.priorRecoveryIds.includes(record.id)).length,0)
  assert.ok((await readFile(path.join(options.output,'create-safe-saved.xml'),'utf8')).includes('已保存到文件'))
  result.exactCreationVerified=true
}else{
  assert.deepEqual(audit(),[],'No candidate bytes may be sent through an unconfirmed new handle')
  assert.deepEqual(providerFiles().sort(),(scenario==='create-renamed'?['Existing.md',`Renamed-${relativePath}`]:['Existing.md']).sort())
  if(scenario==='create-renamed')assert.equal(run('exec-out','run-as',provider,'cat',`files/${scenario}/Renamed-${relativePath}`).length,0)
  const record=recoveries().filter(record=>!before.priorRecoveryIds.includes(record.id)).sort((a,b)=>b.created-a.created)[0];assert.ok(record)
  assert.equal(record.original,null);assert.equal(record.candidate,content);assert.equal(record.expectedSignature,null)
  const draft=JSON.parse(run('exec-out','run-as',app,'cat',draftPath));assert.equal(draft.content,content);assert.equal(draft.expectedSignature,null)
  result.recoveryId=record.id;result.privateRecoverySha256=record.privateSha256;result.providerWriteOpenCount=0
  if(options.stage==='failed'){
    assert.ok((await readFile(path.join(options.output,`${scenario}-failed.xml`),'utf8')).includes('文件夹未能按这个名称新建笔记'))
    await save(`${scenario}-recovery.json`,record)
  }else{
    const protectedRecord=await jsonFile(`${scenario}-recovery.json`);assert.equal(protectedRecord.privateSha256,record.privateSha256)
    const copies=appFiles('library').filter(file=>!before.priorCopies.includes(file) && file.split('/').pop().startsWith(relativePath.replace(/\.md$/,'')+'-')).map(file=>({file,sha256:sha(run('exec-out','run-as',app,'cat',file))}))
    assert.ok(copies.some(copy=>copy.sha256===sha(content)));result.copies=copies
  }
}
if(options.stage==='final'){
  const build=JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json','utf8')).replace(/^\uFEFF/,''));assert.equal(build.verification.versionCode,1002016)
  const apk=run('shell','pm','path',app).toString().trim().replace(/^package:/,'')
  result.installedApkSha256=run('shell','sha256sum',apk).toString().trim().split(/\s+/)[0];assert.equal(result.installedApkSha256,build.sha256)
  assert.match(run('shell','dumpsys','connectivity').toString(),/Active default network: none/)
}
result.passed=true;result.scope='Dedicated API 29 AVD / WebView 124, separate synthetic DocumentsProvider; provider rename is permitted by Android, alias is a deliberate contract-violation fixture. No physical phone or real cloud provider claim.'
await save(`${scenario}-${options.stage}.json`,result);console.log(`${scenario} ${options.stage}: exact content, protected source, draft/recovery and provider write count verified`)
