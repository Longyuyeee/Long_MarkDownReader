import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
const args=process.argv.slice(2),o=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]))
assert.equal(o.serial,'emulator-5558');assert.ok(o.output&&/^[a-z-]+$/.test(o.stage))
const app='com.longyuye.mdreader.mobile.dev',fixture='com.longyuye.mdreader.storagefixture',json=b=>JSON.parse(b.toString().replace(/^\uFEFF/,''))
const run=(...a)=>{const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',o.serial,...a],{timeout:30000,maxBuffer:48*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
const hashes=(folder,p=app)=>Object.fromEntries(run('exec-out','run-as',p,'find',folder,'-type','f','-exec','sha256sum','{}',';').toString().trim().split(/\r?\n/).filter(Boolean).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m);return[m[2],m[1]]}))
const draftFiles=run('exec-out','run-as',app,'find','files/drafts-v1','-type','f').toString().trim().split(/\r?\n/).filter(f=>f.endsWith('.json'))
const drafts=Object.fromEntries(draftFiles.map(f=>{const{updated,...d}=json(run('exec-out','run-as',app,'cat',f));return[f,d]}))
const now={library:hashes('files/library'),drafts,imports:hashes('files/text-imports-v1'),packs:hashes('files/pack-imports-v1'),pdfReceipts:hashes('files/pdf-imports-v1'),provider:hashes('files',fixture)}
await mkdir(o.output,{recursive:true});const out=f=>path.join(o.output,f),result={kind:'mobile-pdf-password-native',stage:o.stage,time:new Date().toISOString(),nativeAndroidTest:true,passed:false}
if(o.stage==='before'){
 assert.equal(Object.keys(now.library).length,99);assert.equal(Object.keys(now.drafts).length,8);assert.equal(Object.keys(now.provider).length,95)
 const settings=Object.fromEntries(['enabled_accessibility_services','accessibility_enabled'].map(k=>[k,run('shell','settings','get','secure',k).toString().trim()]));await writeFile(out('before.json'),JSON.stringify({...result,...now,settings,orientationSettings:Object.fromEntries(['accelerometer_rotation','user_rotation'].map(k=>[k,run('shell','settings','get','system',k).toString().trim()])),passed:true},null,2)+'\n');console.log('Captured protected password baseline');process.exit(0)
}
const before=json(await readFile(out('before.json')));const extra=Object.entries(now.library).filter(([f])=>!Object.hasOwn(before.library,f));assert.ok(extra.length<=1,'Only the deliberate encrypted PDF may be added');for(const[f,sha]of extra){assert.match(f,/LongEdit-Encrypted-导入-[a-f0-9-]+\.pdf$/);assert.equal(sha,'bea6973d9e8381315b1318ff7123523f483e94e01c5ff0bc6dcb5542de141061')}
for(const k of Object.keys(now))assert.deepEqual(k==='library'?Object.fromEntries(Object.entries(now[k]).filter(([f])=>Object.hasOwn(before.library,f))):now[k],before[k],'Original '+k+' preserved')
const expected=(o.expect||'连续阅读').split('|');let ui='',uiCaptureAttempts=0
for(let attempt=1;attempt<=4;attempt++){
 run('shell','uiautomator','dump','/sdcard/longedit-pdf-password-check.xml');ui=run('shell','cat','/sdcard/longedit-pdf-password-check.xml').toString();uiCaptureAttempts=attempt
 if(expected.every(text=>ui.includes(text)))break
 await writeFile(out(`${o.stage}-capture-${attempt}.xml`),ui)
 await new Promise(resolve=>setTimeout(resolve,500))
}
await writeFile(out(o.stage+'-check.xml'),ui)
for(const text of expected)assert.ok(ui.includes(text),'Expected native UI: '+text)
Object.assign(result,{passed:true,uiCaptureAttempts,protectedLibraryFiles:99,addedEncryptedPdfFiles:extra.length,addedEncryptedPdf:extra,protectedDrafts:8,protectedImportFiles:Object.keys(now.imports).length,protectedPackageFiles:Object.keys(now.packs).length,protectedPdfReceiptFiles:Object.keys(now.pdfReceipts).length,protectedProviderFiles:95,expected:o.expect||'连续阅读'});await writeFile(out(o.stage+'.json'),JSON.stringify(result,null,2)+'\n');console.log(o.stage+': passed')
