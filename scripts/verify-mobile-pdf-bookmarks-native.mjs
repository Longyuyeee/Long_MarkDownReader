import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
const stages=['before','empty','added','renamed','draft','reopened-draft','saved','three','delete-confirm','deleted','reopened','undo','jump','closed','resumed','final']
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&stages.includes(o.stage))
const app='com.longyuye.mdreader.mobile.dev',fixture='com.longyuye.mdreader.storagefixture',json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,''))
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{timeout:30000,maxBuffer:48*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const read=f=>run('exec-out','run-as',app,'cat',f),files=folder=>run('exec-out','run-as',app,'find',folder,'-type','f').toString().trim().split(/\r?\n/).filter(Boolean)
const hashes=(folder,p=app)=>Object.fromEntries(run('exec-out','run-as',p,'find',folder,'-type','f','-exec','sha256sum','{}',';').toString().trim().split(/\r?\n/).filter(Boolean).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m);return[m[2],m[1]]}))
const drafts=()=>Object.fromEntries(files('files/drafts-v1').filter(f=>f.endsWith('.json')).map(f=>{const{updated,...d}=json(read(f));return[f,d]}))
await mkdir(o.output,{recursive:true});const output=f=>path.join(o.output,f),now={library:hashes('files/library'),drafts:drafts(),imports:hashes('files/text-imports-v1'),packs:hashes('files/pack-imports-v1'),provider:hashes('files',fixture)}
const result={kind:'mobile-pdf-bookmarks-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){assert.equal(Object.keys(now.library).length,95);assert.equal(Object.keys(now.provider).length,95);await writeFile(output('before.json'),JSON.stringify({...result,...now,passed:true},null,2)+'\n');console.log('95 app / 95 provider files captured');process.exit(0)}
const before=json(await readFile(output('before.json')));for(const k of Object.keys(now))assert.deepEqual(now[k],before[k],'Original '+k+' bytes/counts preserved')
run('shell','uiautomator','dump','/sdcard/longedit-bookmarks-check.xml');const ui=run('shell','cat','/sdcard/longedit-bookmarks-check.xml').toString();await writeFile(output(o.stage+'-check.xml'),ui)
if(o.stage==='empty')assert.ok(ui.includes('还没有书签')&&ui.includes('添加本页书签'))
if(o.stage==='added')assert.ok(ui.includes('我的书签 · 1 枚')&&ui.includes('打开书签：第 3 页，第 3 页'))
if(o.stage==='renamed')assert.ok(ui.includes('打开书签：安静阅读，第 3 页'))
if(['draft','reopened-draft'].includes(o.stage))assert.ok(ui.includes('text="安静阅读，保留想法"')&&ui.includes('打开书签：安静阅读，第 3 页'))
if(o.stage==='saved')assert.ok(ui.includes('打开书签：安静阅读，保留想法，第 3 页')&&!ui.includes('保存名称'))
if(['three','undo'].includes(o.stage))assert.ok(ui.includes('我的书签 · 3 枚')&&ui.includes('打开书签：阅读从这里开始，第 1 页')&&ui.includes('打开书签：安静阅读，第 3 页')&&ui.includes('打开书签：复习与整理，第 7 页'))
if(o.stage==='delete-confirm')assert.ok(ui.includes('确认删除书签')&&ui.includes('我的书签 · 3 枚'))
if(['deleted','reopened'].includes(o.stage))assert.ok(ui.includes('我的书签 · 2 枚')&&ui.includes('撤销删除')&&!ui.includes('打开书签：阅读从这里开始，第 1 页'))
if(['jump','closed','resumed','final'].includes(o.stage))assert.ok(ui.includes('第 7 / 9 页')&&!ui.includes('我的书签 ·'))
Object.assign(result,{passed:true,protectedFiles:95,protectedDrafts:Object.keys(now.drafts).length,protectedImportFiles:Object.keys(now.imports).length,protectedPackageFiles:Object.keys(now.packs).length,protectedProviderFiles:95})
await writeFile(output(o.stage+'.json'),JSON.stringify(result,null,2)+'\n');console.log(o.stage+': passed')
if(o.stage==='final'){
  const records=await Promise.all(stages.map(s=>readFile(output(s+'.json')).then(json)));assert.ok(records.every(r=>r.passed))
  const p=run('shell','pm','path',app).toString().trim().replace(/^package:/,'');assert.match(p,/^\/data\/app\/[^\r\n]+\/base\.apk$/)
  const installed=run('shell','sha256sum',p).toString().trim().split(/\s+/)[0],build=json(await readFile(output('build-x86_64.json')));assert.equal(installed,build.sha256)
  await writeFile(output('webview.txt'),run('shell','dumpsys','webviewupdate'))
  await writeFile(output('summary.json'),JSON.stringify({...result,stages:records.map(r=>({stage:r.stage,passed:r.passed})),serial:o.serial,avd:'LongEdit_Compat_API29',sdk:29,abi:'x86_64',installedApkSha256:installed,scope:'Existing synthetic nine-page PDF. Real UI bookmark add/rename, Chinese focused-input accessibility actions, durable uncommitted name through process kill, three physical pages, non-mutating delete confirmation, persistent deletion Undo, page-7 jump/close/resume. No library/provider source or draft-content mutation. Not physical ARM devices, all providers, full TalkBack or iOS.'},null,2)+'\n')
}
