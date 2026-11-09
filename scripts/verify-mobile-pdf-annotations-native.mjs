import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
const stages=['before','imported','selected','highlighted','commented','draft','reopened','conflict','saved','note','final']
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&stages.includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',fixture='com.longyuye.mdreader.storagefixture',sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,''))
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{timeout:30000,maxBuffer:48*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const read=f=>run('exec-out','run-as',app,'cat',f),files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find','files/'+folder,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const hashes=folder=>Object.fromEntries(files(folder).sort().map(f=>[f,sha(read(f))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]}))
await mkdir(o.output,{recursive:true});const output=f=>path.join(o.output,f),save=r=>writeFile(output(o.stage+'.json'),JSON.stringify(r,null,2)+'\n'),load=stage=>readFile(output(stage+'.json')).then(json)
const now={library:hashes('library'),drafts:drafts(),imports:hashes('text-imports-v1'),packs:hashes('pack-imports-v1')},result={kind:'mobile-pdf-annotations-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){await save({...result,...now,passed:true});console.log('baseline captured');process.exit(0)}
const before=await load('before'),source=await readFile('tests/android-storage-provider/src/main/assets/pdf-reading/reading-guide.pdf')
for(const[f,digest]of Object.entries(before.library))assert.equal(now.library[f],digest,'Prior source unchanged: '+f)
assert.deepEqual(now.drafts,before.drafts);assert.deepEqual(now.imports,before.imports);assert.deepEqual(now.packs,before.packs)
const own=Object.keys(now.library).filter(f=>!Object.hasOwn(before.library,f)),pdfs=own.filter(f=>/MobileReading-导入-.*\.pdf$/.test(f));assert.equal(pdfs.length,1);assert.equal(now.library[pdfs[0]],sha(source));assert.equal(sha(run('exec-out','run-as',fixture,'cat','files/pdf-reading.source')),sha(source))
const companion=pdfs[0]+'.annotations.json',sidecar=own.includes(companion)?json(read(companion)):null
if(['imported','selected'].includes(o.stage)) assert.equal(sidecar,null)
else {
 assert.equal(sidecar.schemaVersion,1);assert.equal(sidecar.source.pdfFile,pdfs[0].split('/').pop());assert.equal(sidecar.source.size,source.length);assert.ok(sidecar.source.fingerprint)
 assert.equal(sidecar.annotations[0].kind,'highlight');assert.ok(sidecar.annotations[0].quote.trim());assert.ok(sidecar.annotations[0].rects.length);assert.equal(sidecar.annotations[0].comment,'Native-highlight')
 for(const a of sidecar.annotations)for(const r of a.rects)assert.ok(r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=1.000001)
 assert.equal(sidecar.annotations.length,o.stage==='highlighted'?1:2)
 if(o.stage!=='highlighted'){assert.equal(sidecar.annotations[1].page,3);assert.equal(sidecar.annotations[1].comment,['saved','note','final'].includes(o.stage)?'Native-page-three-resumed':'Native-page-three')}
}
const notes=own.filter(f=>/-阅读笔记-.*\.md$/.test(f));assert.equal(notes.length,['note','final'].includes(o.stage)?1:0)
if(notes.length){const text=read(notes[0]).toString('utf8');assert.ok(text.includes('Native-highlight'));assert.ok(text.includes('Native-page-three-resumed'));assert.ok(text.includes('第 3 页'));assert.ok(text.includes('不会自动更新'))}
run('shell','uiautomator','dump','/sdcard/longedit-pdf-annotations-check.xml');const ui=run('shell','cat','/sdcard/longedit-pdf-annotations-check.xml').toString();await writeFile(output(o.stage+'-check.xml'),ui)
if(o.stage==='conflict'){assert.ok(ui.includes('已变化'));assert.ok(ui.includes('Native-page-three-resumed'))}
if(o.stage==='selected')assert.ok(ui.includes('高亮与评论'))
if(['draft','reopened'].includes(o.stage))assert.ok(ui.includes('Native-page-three-resumed'))
if(['highlighted','commented','saved','final'].includes(o.stage))assert.ok(ui.includes('批注已保存'))
if(o.stage==='note')assert.ok(ui.includes('阅读笔记'))
Object.assign(result,{passed:true,localFile:pdfs[0],sidecarSha256:sidecar?now.library[companion]:null,annotations:sidecar?.annotations.length||0,note:notes[0]||null,protectedFiles:Object.keys(before.library).length,totalFiles:Object.keys(now.library).length,protectedDrafts:Object.keys(before.drafts).length,protectedImportFiles:Object.keys(before.imports).length,protectedPackageFiles:Object.keys(before.packs).length});await save(result);console.log(o.stage+': passed')
if(o.stage==='final'){
 const records=await Promise.all(stages.map(load));assert.ok(records.every(r=>r.passed));assert.equal((await load('commented')).sidecarSha256,(await load('draft')).sidecarSha256);assert.equal((await load('draft')).sidecarSha256,(await load('reopened')).sidecarSha256)
 const p=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');assert.match(p,/^\/data\/app\/[^\r\n]+\/base\.apk$/)
 const build=json(await readFile(output('build-x86_64.json'))),installedSha=run('shell','sha256sum',p).toString().trim().split(/\s+/)[0];assert.equal(installedSha,build.sha256)
 await writeFile(output('webview.txt'),run('shell','dumpsys','webviewupdate'))
 await writeFile(output('summary.json'),JSON.stringify({...result,stages:records.map(r=>({stage:r.stage,passed:r.passed})),serial:o.serial,avd:'LongEdit_Compat_API29',sdk:29,abi:'x86_64',installedApkSha256:installedSha,scope:'Owned synthetic API29 emulator; real touch long-press selection, desktop v1 sidecar writes with PDF byte preservation, page comment, process-kill draft restoration, Markdown note creation, protected prior notes/drafts/intake/packages. Not external SAF annotation writes, real devices/iOS, arbitrary producers/rotations or full TalkBack.'},null,2)+'\n')
}
