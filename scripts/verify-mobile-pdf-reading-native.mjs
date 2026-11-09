import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
const stages=['before','imported','page-two','zoomed','located','search-results','searched','text','returned','reopened','cancelled','paused','final']
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&stages.includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',fixture='com.longyuye.mdreader.storagefixture',sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,''))
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{timeout:30000,maxBuffer:48*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const read=f=>run('exec-out','run-as',app,'cat',f),files=folder=>run('exec-out','run-as',app,'ls','files').toString().split(/\s+/).includes(folder)?run('exec-out','run-as',app,'find','files/'+folder,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean):[]
const hashes=folder=>Object.fromEntries(files(folder).sort().map(f=>[f,sha(read(f))])),drafts=()=>Object.fromEntries(files('drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]}))
await mkdir(o.output,{recursive:true});const output=f=>path.join(o.output,f),save=r=>writeFile(output(o.stage+'.json'),JSON.stringify(r,null,2)+'\n'),load=stage=>readFile(output(stage+'.json')).then(json)
const now={library:hashes('library'),drafts:drafts(),imports:hashes('text-imports-v1'),packs:hashes('pack-imports-v1')},result={kind:'mobile-pdf-reading-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){await save({...result,...now,passed:true});console.log('baseline captured');process.exit(0)}
const before=await load('before'),source=await readFile('tests/android-storage-provider/src/main/assets/pdf-reading/reading-guide.pdf')
for(const[f,digest]of Object.entries(before.library))assert.equal(now.library[f],digest,'Prior source unchanged: '+f)
assert.deepEqual(now.drafts,before.drafts,'Prior draft content/signature/revision unchanged');assert.deepEqual(now.imports,before.imports,'All prior intake files unchanged');assert.deepEqual(now.packs,before.packs,'All prior package files unchanged')
const own=Object.keys(now.library).filter(f=>!Object.hasOwn(before.library,f));assert.equal(own.length,1);assert.match(own[0],/MobileReading-导入-.*\.pdf$/);assert.equal(now.library[own[0]],sha(source),'Imported PDF byte identity');assert.equal(sha(run('exec-out','run-as',fixture,'cat','files/pdf-reading.source')),sha(source),'Readonly provider source unchanged')
run('shell','uiautomator','dump','/sdcard/longedit-pdf-check.xml');const ui=run('shell','cat','/sdcard/longedit-pdf-check.xml').toString();await writeFile(output(o.stage+'-check.xml'),ui)
if(['returned','cancelled'].includes(o.stage))assert.ok(ui.includes('text="导入 PDF 阅读"'),'Back at the real library')
else if(o.stage==='search-results'){assert.ok(ui.includes('已检查 3 / 3 页，找到 3 处。'));assert.ok(ui.includes('第 3 页'))}
else {const page=o.stage==='imported'?1:['page-two','zoomed'].includes(o.stage)?2:3;assert.ok(ui.includes(`text="第 ${page} / 3 页"`),'Expected actual page control '+page);if(['zoomed','located','reopened','paused','final'].includes(o.stage))assert.ok(ui.includes('text="150%"'),'Zoom persisted');if(o.stage==='text')assert.ok(ui.includes('中文检索：安静阅读'))}
Object.assign(result,{passed:true,localFile:own[0],sourceSha256:sha(source),protectedFiles:Object.keys(before.library).length,totalFiles:Object.keys(now.library).length,protectedDrafts:Object.keys(before.drafts).length,protectedImportFiles:Object.keys(before.imports).length,protectedPackageFiles:Object.keys(before.packs).length});await save(result);console.log(o.stage+': passed')
if(o.stage==='final'){
 const records=await Promise.all(stages.map(load));assert.ok(records.every(r=>r.passed))
 const installed=packageName=>{const p=run('shell','pm','path',packageName).toString().trim().replace(/^package:/,'');assert.match(p,/^\/data\/app\/[^\r\n]+\/base\.apk$/);return run('shell','sha256sum',p).toString().trim().split(/\s+/)[0]}
 const build=json(await readFile(output('build-x86_64.json'))),installedApkSha256=installed(app),fixtureApkSha256=installed(fixture);assert.equal(installedApkSha256,build.sha256);assert.equal(fixtureApkSha256,sha(await readFile('tests/android-storage-provider/build/outputs/apk/debug/longedit-storage-fixture-debug.apk')))
 await writeFile(output('webview.txt'),run('shell','dumpsys','webviewupdate'))
 const summary={...result,kind:'mobile-pdf-reading-native',stages:records.map(r=>({stage:r.stage,passed:r.passed})),serial:o.serial,avd:'LongEdit_Compat_API29',sdk:29,abi:run('shell','getprop','ro.product.cpu.abi').toString().trim(),memory:run('shell','cat','/proc/meminfo').toString().split(/\r?\n/).find(s=>s.startsWith('MemTotal:')),installedApkSha256,fixtureApkSha256,scope:'Owned synthetic API29 emulator. Real DocumentsUI import/cancel, local immutable PDF copy, one-page raster reading, navigation/zoom, real text extraction/search, background and process restart. Existing files/drafts/intake/package files protected. Not all PDF producers, large image decoding, external folder PDF, password, annotations, real device, iOS or complete TalkBack coverage.'}
 await writeFile(output('summary.json'),JSON.stringify(summary,null,2)+'\n')
}
