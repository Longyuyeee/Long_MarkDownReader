import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
const stages=['before','imported','seeded','filtered','preview','conflict','saved','linked','reopened','final']
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&stages.includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,''))
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{timeout:30000,maxBuffer:48*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const read=f=>run('exec-out','run-as',app,'cat',f),files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find','files/'+folder,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const hashes=folder=>Object.fromEntries(files(folder).sort().map(f=>[f,sha(read(f))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]}))
await mkdir(o.output,{recursive:true});const output=f=>path.join(o.output,f),save=r=>writeFile(output(o.stage+'.json'),JSON.stringify(r,null,2)+'\n'),load=stage=>readFile(output(stage+'.json')).then(json)
const now={library:hashes('library'),drafts:drafts(),imports:hashes('text-imports-v1'),packs:hashes('pack-imports-v1')},result={kind:'mobile-pdf-selection-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){await save({...result,...now,passed:true});console.log('baseline captured');process.exit(0)}
const before=await load('before'),source=await readFile('tests/android-storage-provider/src/main/assets/pdf-reading/reading-guide.pdf')
for(const[f,digest]of Object.entries(before.library))assert.equal(now.library[f],digest,'Prior source unchanged: '+f)
assert.deepEqual(now.drafts,before.drafts);assert.deepEqual(now.imports,before.imports);assert.deepEqual(now.packs,before.packs)
const own=Object.keys(now.library).filter(f=>!Object.hasOwn(before.library,f)),pdfs=own.filter(f=>/MobileReading-导入-.*\.pdf$/.test(f));assert.equal(pdfs.length,1);assert.equal(now.library[pdfs[0]],sha(source));assert.equal(sha(run('exec-out','run-as','com.longyuye.mdreader.storagefixture','cat','files/pdf-reading.source')),sha(source))
const companion=pdfs[0]+'.annotations.json',sidecar=own.includes(companion)?json(read(companion)):null
if(o.stage==='imported')assert.equal(sidecar,null)
else {
 assert.equal(sidecar.annotations.length,3);assert.ok(sidecar.annotations.some(a=>a.page===1&&a.comment==='Selection-one'&&a.color==='yellow'));assert.ok(sidecar.annotations.some(a=>a.page===1&&a.comment==='Selection-two'&&a.color==='pink'));assert.ok(sidecar.annotations.some(a=>a.page===3&&a.comment==='Selection-three'&&a.color==='green'))
 if(o.stage!=='seeded')assert.deepEqual(sidecar,(await load('seeded')).annotationDocument,'Selection/filter/preview never modifies the sidecar document')
 if(['filtered','preview'].includes(o.stage))assert.equal(now.library[companion],(await load('seeded')).sidecarSha256)
 if(['saved','linked','reopened','final'].includes(o.stage))assert.equal(now.library[companion],(await load('conflict')).sidecarSha256)
}
const notes=own.filter(f=>/-阅读笔记-.*\.md$/.test(f)),hasNote=['saved','linked','reopened','final'].includes(o.stage);assert.equal(notes.length,hasNote?1:0)
if(hasNote){const text=read(notes[0]).toString('utf8');assert.ok(text.includes('Selection-one'));assert.ok(text.includes('Selection-three'));assert.ok(!text.includes('Selection-two'));const links=[...text.matchAll(/\[原文第 (\d+) 页\]\(([^)]+)\)/g)];assert.deepEqual(links.map(m=>Number(m[1])),[1,3]);for(const match of links){const u=new URL(match[2]);assert.equal(u.searchParams.get('root'),'local');assert.equal(u.searchParams.get('path'),pdfs[0].replace(/^files\/library\//,''));assert.equal(u.searchParams.get('sha256'),sha(source));assert.ok(sidecar.annotations.some(a=>a.id===u.searchParams.get('annotation')&&String(a.page)===match[1]))}if(o.stage!=='saved')assert.equal(now.library[notes[0]],(await load('saved')).noteSha256);await writeFile(output('generated-reading-note.md'),text)}
run('shell','uiautomator','dump','/sdcard/longedit-pdf-selection-check.xml');const ui=run('shell','cat','/sdcard/longedit-pdf-selection-check.xml').toString();await writeFile(output(o.stage+'-check.xml'),ui)
if(o.stage==='filtered')assert.ok(ui.includes('其中 1 条不在当前筛选中')&&ui.includes('预览笔记 · 2 条'))
if(o.stage==='preview')assert.ok(ui.includes('预览阅读笔记')&&ui.includes('保存阅读笔记'))
if(o.stage==='conflict')assert.ok(ui.includes('已有变化'))
if(o.stage==='linked')assert.ok(ui.includes('已定位第 3 页批注'))
if(o.stage==='reopened')assert.ok(ui.includes('原文来源 2'))
Object.assign(result,{passed:true,localFile:pdfs[0],sidecarSha256:sidecar?now.library[companion]:null,annotationDocument:sidecar,note:notes[0]||null,noteSha256:notes[0]?now.library[notes[0]]:null,protectedFiles:Object.keys(before.library).length,totalFiles:Object.keys(now.library).length,protectedDrafts:Object.keys(before.drafts).length,protectedImportFiles:Object.keys(before.imports).length,protectedPackageFiles:Object.keys(before.packs).length});await save(result);console.log(o.stage+': passed')
if(o.stage==='final'){
 const records=await Promise.all(stages.map(load));assert.ok(records.every(r=>r.passed));const p=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');assert.match(p,/^\/data\/app\/[^\r\n]+\/base\.apk$/)
 const build=json(await readFile(output('build-x86_64.json'))),installedSha=run('shell','sha256sum',p).toString().trim().split(/\s+/)[0];assert.equal(installedSha,build.sha256)
 await writeFile(output('webview.txt'),run('shell','dumpsys','webviewupdate'))
 await writeFile(output('annotations.json'),read(companion))
 await writeFile(output('summary.json'),JSON.stringify({...result,stages:records.map(r=>({stage:r.stage,passed:r.passed})),serial:o.serial,avd:'LongEdit_Compat_API29',sdk:29,abi:'x86_64',installedApkSha256:installedSha,scope:'Owned synthetic API29 emulator: three UI-created comments, filter search, hidden selection retained, preview creates no file, external revision conflict rejects, fresh reread and selective note saving, source page backlink and note reopening after process kill. All prior data protected. Not all devices/providers, full TalkBack or iOS.'},null,2)+'\n')
}
