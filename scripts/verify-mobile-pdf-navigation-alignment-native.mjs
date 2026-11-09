import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
const stages=['before','before-style','opened','outline','collapsed','pages','dark','chapter','back','reopened','final']
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&stages.includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',fixture='com.longyuye.mdreader.storagefixture'
const sha=b=>createHash('sha256').update(b).digest('hex'),json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,''))
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{timeout:30000,maxBuffer:48*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29')
assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const read=(f,p=app)=>run('exec-out','run-as',p,'cat',f)
const files=(folder,p=app)=>run('exec-out','run-as',p,'find',folder,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean)
const hashes=(folder,p=app)=>Object.fromEntries(run('exec-out','run-as',p,'find',folder,'-type','f','-exec','sha256sum','{}',';').toString().trim().split(/\r?\n/).filter(Boolean).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m,'Device hash output');return[m[2],m[1]]}).sort(([a],[b])=>a.localeCompare(b)))
const drafts=()=>Object.fromEntries(files('files/drafts-v1').filter(f=>f.endsWith('.json')).sort().map(f=>{const{updated,...d}=json(read(f));return[f,d]}))
await mkdir(o.output,{recursive:true});const output=f=>path.join(o.output,f)
const now={library:hashes('files/library'),drafts:drafts(),imports:hashes('files/text-imports-v1'),packs:hashes('files/pack-imports-v1'),provider:hashes('files',fixture)}
const result={kind:'mobile-pdf-navigation-alignment-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){
  assert.equal(Object.keys(now.library).length,95);assert.equal(Object.keys(now.provider).length,95)
  await writeFile(output('before.json'),JSON.stringify({...result,...now,passed:true},null,2)+'\n');console.log('95 app and 95 provider files captured');process.exit(0)
}
const before=json(await readFile(output('before.json')))
for(const key of Object.keys(now))assert.deepEqual(now[key],before[key],'All original '+key+' contents and file counts are preserved')
run('shell','uiautomator','dump','/sdcard/longedit-pdf-alignment-check.xml')
const ui=run('shell','cat','/sdcard/longedit-pdf-alignment-check.xml').toString()
await writeFile(output(o.stage+'-check.xml'),ui)
if(['before-style','outline','dark'].includes(o.stage))assert.ok(ui.includes('来自文档自带目录')&&ui.includes('当前第 3 页'))
if(o.stage==='collapsed')assert.ok(ui.includes('展开章节：阅读从这里开始')&&!ui.includes('带着想法返回'))
if(o.stage==='pages')assert.ok(ui.includes('每次预览最多 6 页')&&ui.includes('打开第 3 页，当前页'))
if(['chapter','back','reopened','final'].includes(o.stage))assert.ok(ui.includes('第 7 / 9 页')&&!ui.includes('来自文档自带目录'))
if(o.stage==='outline')assert.ok(ui.includes('text="MobileNavigation.pdf"'))
Object.assign(result,{passed:true,protectedFiles:Object.keys(now.library).length,protectedDrafts:Object.keys(now.drafts).length,protectedImportFiles:Object.keys(now.imports).length,protectedPackageFiles:Object.keys(now.packs).length,protectedProviderFiles:Object.keys(now.provider).length})
await writeFile(output(o.stage+'.json'),JSON.stringify(result,null,2)+'\n');console.log(o.stage+': passed')
if(o.stage==='final'){
  const records=await Promise.all(stages.map(s=>readFile(output(s+'.json')).then(json)));assert.ok(records.every(r=>r.passed))
  const p=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');assert.match(p,/^\/data\/app\/[^\r\n]+\/base\.apk$/)
  const build=json(await readFile(output('build-x86_64.json'))),installedSha=run('shell','sha256sum',p).toString().trim().split(/\s+/)[0]
  assert.equal(installedSha,build.sha256)
  await writeFile(output('webview.txt'),run('shell','dumpsys','webviewupdate'))
  await writeFile(output('summary.json'),JSON.stringify({...result,stages:records.map(r=>({stage:r.stage,passed:r.passed})),serial:o.serial,avd:'LongEdit_Compat_API29',sdk:29,abi:'x86_64',installedApkSha256:installedSha,scope:'Existing synthetic PDF: same page-3 native before/after captures, hierarchy collapse, real six-page thumbnail batch, dark mode, chapter jump, Android Back and persisted page 7. No import or library/provider mutation. Physical Android devices and iOS untested.'},null,2)+'\n')
}
