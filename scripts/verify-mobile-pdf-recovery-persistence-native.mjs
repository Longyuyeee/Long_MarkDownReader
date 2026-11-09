import assert from 'node:assert/strict'
import {mkdir,writeFile,readFile,access} from 'node:fs/promises'
import {mobileAdb as adb,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
const [out,stage]=process.argv.slice(2);assert.ok(out&&['baseline','closeout'].includes(stage));await mkdir(out,{recursive:true});await assert.rejects(access(out+'/'+stage+'.json'))
assert.equal(adb('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(adb('shell','getprop','ro.build.version.sdk').toString().trim(),'29');adb('shell','am','force-stop',app)
const fixture='com.longyuye.mdreader.storagefixture',recovery='files/pdf-annotation-recovery-v1.json',sidecar='files/library/MobileNavigation-导入-42a61beb-2244-4b82-bd48-f277c27d67e1.pdf.annotations.json'
const hashes=(pkg,folders)=>Object.fromEntries(adb('exec-out','run-as',pkg,'find',...folders,'-type','f','-exec','sha256sum','{}',';').toString().trim().split(/\r?\n/).filter(Boolean).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m,line);return[m[2],m[1]]}))
const report={stage,time:new Date().toISOString(),files:hashes(app,['files','shared_prefs']),provider:hashes(fixture,['files']),settings:{},passed:false}
for(const [pkg,name,folders]of [[app,'private',['files','shared_prefs','app_webview']],[fixture,'fixture',['files']]])await writeFile(out+'/'+stage+'-'+name+'.tar',adb('exec-out','run-as',pkg,'tar','-cf','-',...folders))
for(const [ns,key]of [['secure','enabled_accessibility_services'],['secure','accessibility_enabled'],['secure','default_input_method'],['system','font_scale'],['system','accelerometer_rotation'],['system','user_rotation'],['global','wifi_on'],['global','mobile_data'],['global','webview_provider']])report.settings[ns+'/'+key]=adb('shell','settings','get',ns,key).toString().trim()
await writeFile(out+'/'+stage+'-webview.txt',adb('shell','dumpsys','webviewupdate'));assert.equal(Object.keys(report.files).filter(f=>f.startsWith('files/drafts-v1/')).length,9)
const own=JSON.parse(adb('exec-out','run-as',app,'cat','files/drafts-v1/7b6fd681912dc95f32ff158564ddc76c6fa35260f1f2381e9b297b0a26027e78.json'));assert.equal(own.content,'正在核对手机接收😀\n先保留这段未保存输入\n返回后继续写');assert.equal(Buffer.byteLength(own.content),78)
assert.equal(Object.keys(report.files).filter(f=>f.startsWith('files/library/')).length,stage==='baseline'?100:101)
if(stage==='baseline'){assert.equal(Object.keys(report.files).length,167);assert.equal(Object.hasOwn(report.files,recovery),false);assert.equal(Object.hasOwn(report.files,sidecar),false)}else{
 const before=JSON.parse(await readFile(out+'/baseline.json','utf8'));report.changes=[]
 for(const[file,hash]of Object.entries(before.files)){assert.ok(Object.hasOwn(report.files,file),file);if(report.files[file]!==hash){report.changes.push(file);if(file==='files/profileInstalled'){const bytes=adb('exec-out','run-as',app,'cat',file);assert.equal(bytes.length,24);assert.equal(bytes.readUInt32BE(0),1);const stamp=new Date(Number(bytes.readBigInt64BE(8))).toISOString(),installed=/lastUpdateTime=(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(adb('shell','dumpsys','package',app).toString())?.[1];assert.equal(stamp.slice(0,19).replace('T',' '),installed);report.profileInstalled={recordUpdateTime:stamp,packageUpdateTime:installed}}else assert.ok(file==='files/recent-v1.json'||file.startsWith('shared_prefs/'),file+' changed')}}
 for(const[file,hash]of Object.entries(before.provider))assert.equal(report.provider[file],hash,'provider '+file)
 assert.deepEqual(report.settings,before.settings);report.newFiles=Object.keys(report.files).filter(f=>!Object.hasOwn(before.files,f)).sort();assert.deepEqual(report.newFiles,[recovery,sidecar].sort())
 report.recovery=JSON.parse(adb('exec-out','run-as',app,'cat',recovery));report.sidecar=JSON.parse(adb('exec-out','run-as',app,'cat',sidecar))
 assert.deepEqual(report.recovery.drafts,{});assert.deepEqual(report.recovery.deletions,{})
 assert.equal(report.sidecar.annotations.length,2);assert.equal(new Set(report.sidecar.annotations.map(a=>a.id)).size,2)
}
report.passed=true;await writeFile(out+'/'+stage+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({out,stage,passed:true,files:Object.keys(report.files).length,provider:Object.keys(report.provider).length,changes:report.changes}))
