import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdir,readFile,writeFile,access} from 'node:fs/promises'
import path from 'node:path'
const args=Object.fromEntries(process.argv.slice(2).reduce((out,v,i,a)=>i%2?out:[...out,[v.replace(/^--/,''),a[i+1]]],[])),serial=args.serial,out=args.output,stage=args.stage
assert.equal(serial,'emulator-5558');assert.ok(out&&['baseline','closeout'].includes(stage))
const app='com.longyuye.mdreader.mobile.dev',fixture='com.longyuye.mdreader.storagefixture',adb='E:/Android/Sdk/platform-tools/adb.exe'
const run=(...a)=>{const r=spawnSync(adb,['-s',serial,...a],{timeout:40000,maxBuffer:160*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
assert.equal(run('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(run('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
await mkdir(out,{recursive:true});const target=path.join(out,stage+'.json');await assert.rejects(access(target));run('shell','am','force-stop',app)
const hashes=(pkg,folders)=>Object.fromEntries(run('exec-out','run-as',pkg,'find',...folders,'-type','f','-exec','sha256sum','{}',';').toString().trim().split(/\r?\n/).filter(Boolean).map(line=>{const match=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(match,line);return [match[2],match[1]]}))
const report={time:new Date().toISOString(),serial,stage,nativeAndroidTest:true,files:hashes(app,['files','shared_prefs']),provider:hashes(fixture,['files']),passed:false}
for(const [pkg,name,folders]of [[app,'private',['files','shared_prefs','app_webview']],[fixture,'fixture',['files']]])await writeFile(path.join(out,stage+'-'+name+'.tar'),run('exec-out','run-as',pkg,'tar','-cf','-',...folders))
report.settings={};for(const [ns,key]of [['secure','enabled_accessibility_services'],['secure','accessibility_enabled'],['secure','default_input_method'],['system','font_scale'],['system','accelerometer_rotation'],['system','user_rotation'],['global','wifi_on'],['global','mobile_data'],['global','webview_provider']])report.settings[ns+'/'+key]=run('shell','settings','get',ns,key).toString().trim()
await writeFile(path.join(out,stage+'-webview.txt'),run('shell','dumpsys','webviewupdate'))
assert.equal(Object.keys(report.files).filter(f=>f.startsWith('files/library/')).length,100);assert.equal(Object.keys(report.files).filter(f=>f.startsWith('files/drafts-v1/')).length,9)
const ownDraft='files/drafts-v1/7b6fd681912dc95f32ff158564ddc76c6fa35260f1f2381e9b297b0a26027e78.json',draft=JSON.parse(run('exec-out','run-as',app,'cat',ownDraft));assert.equal(draft.content,'正在核对手机接收😀\n先保留这段未保存输入\n返回后继续写');assert.equal(Buffer.byteLength(draft.content),78)
if(stage==='baseline'){assert.equal(Object.keys(report.files).length,166);assert.equal(Object.hasOwn(report.files,'files/pdf-bookmarks-v1.json'),false)}
else{
 const before=JSON.parse(await readFile(path.join(out,'baseline.json'),'utf8'));report.changes=[]
 for(const [file,hash]of Object.entries(before.files)){assert.ok(Object.hasOwn(report.files,file),file+' missing');if(report.files[file]!==hash){report.changes.push(file);if(file==='files/profileInstalled'){
   const bytes=run('exec-out','run-as',app,'cat',file);assert.equal(bytes.length,24);assert.equal(bytes.readUInt32BE(0),1)
   const stamp=new Date(Number(bytes.readBigInt64BE(8))).toISOString(),packageStamp=/lastUpdateTime=(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(run('shell','dumpsys','package',app).toString())?.[1]
   assert.equal(stamp.slice(0,19).replace('T',' '),packageStamp);report.profileInstalled={bytes:24,packageUpdateTime:packageStamp,recordUpdateTime:stamp}
 }else assert.ok(file==='files/recent-v1.json'||file.startsWith('shared_prefs/'),file+' changed')}}
 for(const [file,hash]of Object.entries(before.provider))assert.equal(report.provider[file],hash,'provider '+file)
 assert.deepEqual(report.settings,before.settings);assert.ok(Object.hasOwn(report.files,'files/pdf-bookmarks-v1.json'))
 report.newFiles=Object.keys(report.files).filter(file=>!Object.hasOwn(before.files,file));assert.deepEqual(report.newFiles,['files/pdf-bookmarks-v1.json'])
}
report.passed=true;await writeFile(target,JSON.stringify(report,null,2));console.log(JSON.stringify({target,passed:true,files:Object.keys(report.files).length,provider:Object.keys(report.provider).length,changes:report.changes}))
