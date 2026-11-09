import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
const stages=['before','imported','seeded','note','linked','conflict','deleted','restarted','restored','removed-again','missing-link','returned','final']
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&stages.includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',fixture='com.longyuye.mdreader.storagefixture',sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,''))
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{timeout:30000,maxBuffer:48*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const read=f=>run('exec-out','run-as',app,'cat',f),files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find','files/'+folder,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const hashes=folder=>Object.fromEntries(files(folder).sort().map(f=>[f,sha(read(f))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]}))
await mkdir(o.output,{recursive:true});const output=f=>path.join(o.output,f),save=r=>writeFile(output(o.stage+'.json'),JSON.stringify(r,null,2)+'\n'),load=stage=>readFile(output(stage+'.json')).then(json)
const now={library:hashes('library'),drafts:drafts(),imports:hashes('text-imports-v1'),packs:hashes('pack-imports-v1')},result={kind:'mobile-pdf-recovery-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){await save({...result,...now,passed:true});console.log('baseline captured');process.exit(0)}
const before=await load('before'),source=await readFile('tests/android-storage-provider/src/main/assets/pdf-reading/reading-guide.pdf')
for(const[f,digest]of Object.entries(before.library))assert.equal(now.library[f],digest,'Prior source unchanged: '+f)
assert.deepEqual(now.drafts,before.drafts);assert.deepEqual(now.imports,before.imports);assert.deepEqual(now.packs,before.packs)
const own=Object.keys(now.library).filter(f=>!Object.hasOwn(before.library,f)),pdfs=own.filter(f=>/MobileReading-导入-.*\.pdf$/.test(f));assert.equal(pdfs.length,1);assert.equal(now.library[pdfs[0]],sha(source));assert.equal(sha(run('exec-out','run-as',fixture,'cat','files/pdf-reading.source')),sha(source))
const companion=pdfs[0]+'.annotations.json',sidecar=own.includes(companion)?json(read(companion)):null
if(o.stage==='imported')assert.equal(sidecar,null)
else {
 assert.equal(sidecar.schemaVersion,1);assert.equal(sidecar.source.pdfFile,pdfs[0].split('/').pop());assert.equal(sidecar.source.size,source.length);assert.ok(sidecar.source.fingerprint)
 const removed=['deleted','restarted','removed-again','missing-link','returned'].includes(o.stage);assert.equal(sidecar.annotations.length,removed?1:2)
 assert.ok(sidecar.annotations.some(a=>a.page===3&&a.comment==='Recovery-page-three'&&a.color==='green'))
 if(!removed){assert.ok(sidecar.annotations.some(a=>a.kind==='highlight'&&a.quote.trim()&&a.comment==='Recovery-highlight'));if(o.stage!=='seeded'){const seed=await load('seeded');for(const a of sidecar.annotations)assert.deepEqual(a,seed.annotationRecords.find(v=>v.id===a.id),'Restored original annotation identity/content/geometry/timestamps')}}
}
const notes=own.filter(f=>/-阅读笔记-.*\.md$/.test(f)),hasNote=!['imported','seeded'].includes(o.stage);assert.equal(notes.length,hasNote?1:0)
if(hasNote){const text=read(notes[0]).toString('utf8');assert.ok(text.startsWith('# MobileReading · 阅读笔记'));assert.ok(text.includes('Recovery-highlight'));assert.ok(text.includes('Recovery-page-three'));assert.ok(text.includes('不会自动更新'));const links=[...text.matchAll(/\[原文第 (\d+) 页\]\(([^)]+)\)/g)];assert.equal(links.length,2);for(const match of links){const u=new URL(match[2]);assert.equal(u.protocol,'longedit:');assert.equal(u.hostname,'pdf');assert.equal(u.searchParams.get('root'),'local');assert.equal(u.searchParams.get('path'),pdfs[0].replace(/^files\/library\//,''));assert.equal(u.searchParams.get('page'),match[1]);assert.equal(u.searchParams.get('sha256'),sha(source));assert.ok(u.searchParams.get('annotation'))}if(o.stage!=='note')assert.equal(now.library[notes[0]],(await load('note')).noteSha256,'Previously generated note remains an exact immutable snapshot')}
run('shell','uiautomator','dump','/sdcard/longedit-pdf-recovery-check.xml');const ui=run('shell','cat','/sdcard/longedit-pdf-recovery-check.xml').toString();await writeFile(output(o.stage+'-check.xml'),ui)
if(o.stage==='imported')assert.ok(ui.includes('第 1 / 3 页'))
if(o.stage==='linked')assert.ok(ui.includes('已定位第 3 页批注'))
if(o.stage==='conflict')assert.ok(ui.includes('删除尚未确认')&&ui.includes('已变化'))
if(['deleted','restarted','removed-again'].includes(o.stage))assert.ok(ui.includes('撤销删除'))
if(['restored','final'].includes(o.stage))assert.ok(ui.includes('已恢复删除的批注'))
if(o.stage==='missing-link')assert.ok(ui.includes('原批注已删除，已打开第 1 页'))
if(['note','returned'].includes(o.stage))assert.ok(ui.includes('原文来源 2'))
Object.assign(result,{passed:true,localFile:pdfs[0],sidecarSha256:sidecar?now.library[companion]:null,annotationRecords:sidecar?.annotations||[],note:notes[0]||null,noteSha256:notes[0]?now.library[notes[0]]:null,protectedFiles:Object.keys(before.library).length,totalFiles:Object.keys(now.library).length,protectedDrafts:Object.keys(before.drafts).length,protectedImportFiles:Object.keys(before.imports).length,protectedPackageFiles:Object.keys(before.packs).length});await save(result);console.log(o.stage+': passed')
if(o.stage==='final'){
 const records=await Promise.all(stages.map(load));assert.ok(records.every(r=>r.passed));assert.equal((await load('deleted')).sidecarSha256,(await load('restarted')).sidecarSha256)
 const p=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');assert.match(p,/^\/data\/app\/[^\r\n]+\/base\.apk$/)
 const build=json(await readFile(output('build-x86_64.json'))),installedSha=run('shell','sha256sum',p).toString().trim().split(/\s+/)[0];assert.equal(installedSha,build.sha256)
 await writeFile(output('webview.txt'),run('shell','dumpsys','webviewupdate'))
 await writeFile(output('summary.json'),JSON.stringify({...result,stages:records.map(r=>({stage:r.stage,passed:r.passed})),serial:o.serial,avd:'LongEdit_Compat_API29',sdk:29,abi:'x86_64',installedApkSha256:installedSha,scope:'Owned synthetic API29 emulator: real selection, annotation deletion confirmation/cancel/conflict, durable undo after process kill, exact annotation restoration, verified Markdown backlinks through top-level accessible source controls, missing-annotation page fallback and return-to-note. Prior files/drafts/intakes/packages and generated note snapshot preserved. Not OS deep links, all producers/SAF providers, full TalkBack, ARM hardware or iOS.'},null,2)+'\n')
}
