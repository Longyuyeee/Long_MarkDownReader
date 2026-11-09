import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[])),stages=['before','imported','outline','collapsed','chapter','named','invalid','thumbnails','last-batch','last-page','closed','reopened','final']
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&stages.includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',fixture='com.longyuye.mdreader.storagefixture',sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,''))
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{timeout:30000,maxBuffer:48*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const read=(f,p=app)=>run('exec-out','run-as',p,'cat',f),files=(folder,p=app)=>run('exec-out','run-as',p,'find',folder,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean),hashes=(folder,p=app)=>Object.fromEntries(files(folder,p).sort().map(f=>[f,sha(read(f,p))])),drafts=()=>Object.fromEntries(files('files/drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]}))
await mkdir(o.output,{recursive:true});const output=f=>path.join(o.output,f),save=r=>writeFile(output(o.stage+'.json'),JSON.stringify(r,null,2)+'\n'),load=stage=>readFile(output(stage+'.json')).then(json)
const now={library:hashes('files/library'),drafts:drafts(),imports:hashes('files/text-imports-v1'),packs:hashes('files/pack-imports-v1'),provider:hashes('files',fixture)},result={kind:'mobile-pdf-navigation-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){await save({...result,...now,passed:true});console.log('baseline captured');process.exit(0)}
const before=await load('before'),source=await readFile('tests/android-storage-provider/src/main/assets/pdf-navigation/navigation-guide.pdf')
for(const[f,digest]of Object.entries(before.library))assert.equal(now.library[f],digest,'Prior source unchanged: '+f)
for(const[f,digest]of Object.entries(before.provider))assert.equal(now.provider[f],digest,'Prior provider fixture unchanged: '+f)
assert.deepEqual(now.drafts,before.drafts);assert.deepEqual(now.imports,before.imports);assert.deepEqual(now.packs,before.packs)
const own=Object.keys(now.library).filter(f=>!Object.hasOwn(before.library,f));assert.equal(own.length,1);assert.match(own[0],/MobileNavigation-导入-[a-f0-9-]{36}\.pdf$/);assert.equal(now.library[own[0]],sha(source));assert.equal(sha(read('files/pdf-navigation.source',fixture)),sha(source))
run('shell','uiautomator','dump','/sdcard/longedit-pdf-navigation-check.xml');const ui=run('shell','cat','/sdcard/longedit-pdf-navigation-check.xml').toString();await writeFile(output(o.stage+'-check.xml'),ui)
const expected={imported:1,chapter:7,named:2,'last-page':9,closed:9,reopened:9,final:9}[o.stage]
if(expected)assert.ok(ui.includes(`第 ${expected} / 9 页`),'Actual physical page '+expected)
if(o.stage==='outline')assert.ok(ui.includes('来自文档自带目录')&&ui.includes('带着想法返回'))
if(o.stage==='collapsed')assert.ok(ui.includes('展开章节：阅读从这里开始')&&!ui.includes('带着想法返回'))
if(o.stage==='invalid')assert.ok(ui.includes('位置无法识别')&&ui.includes('当前第 2 页'))
if(o.stage==='thumbnails')assert.ok(ui.includes('每次预览最多 6 页')&&ui.includes('打开第 1 页'))
if(o.stage==='last-batch')assert.ok(ui.includes('打开第 9 页')&&ui.includes('第 7–9 页'))
Object.assign(result,{passed:true,localFile:own[0],sourceSha256:sha(source),protectedFiles:Object.keys(before.library).length,totalFiles:Object.keys(now.library).length,protectedDrafts:Object.keys(before.drafts).length,protectedImportFiles:Object.keys(before.imports).length,protectedPackageFiles:Object.keys(before.packs).length,protectedProviderFiles:Object.keys(before.provider).length});await save(result);console.log(o.stage+': passed')
if(o.stage==='final'){
 const records=await Promise.all(stages.map(load));assert.ok(records.every(r=>r.passed));const p=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');assert.match(p,/^\/data\/app\/[^\r\n]+\/base\.apk$/)
 const build=json(await readFile(output('build-x86_64.json'))),installedSha=run('shell','sha256sum',p).toString().trim().split(/\s+/)[0];assert.equal(installedSha,build.sha256)
 await writeFile(output('webview.txt'),run('shell','dumpsys','webviewupdate'))
 await writeFile(output('summary.json'),JSON.stringify({...result,stages:records.map(r=>({stage:r.stage,passed:r.passed})),serial:o.serial,avd:'LongEdit_Compat_API29',sdk:29,abi:'x86_64',installedApkSha256:installedSha,scope:'Owned synthetic API29 emulator: real DocumentsUI import, nested outline collapse, local and named destination jumps, invalid destination keeps page, six-page thumbnail batches and last partial batch, closing preserves current page, page 9 resumes after process kill. All prior app/provider files protected; new PDF bytes unchanged, no sidecar or note created. Not all providers/devices, full TalkBack or iOS.'},null,2)+'\n')
}
