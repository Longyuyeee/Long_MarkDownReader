import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {mobileAdb as adb,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
const [out,stage]=process.argv.slice(2)
assert.ok(out&&(stage==='baseline'||/^closeout(?:-[a-z0-9]+)*$/.test(stage)));await mkdir(out,{recursive:true})
for(const suffix of ['.json','-private.tar','-fixture.tar','-webview.txt'])await assert.rejects(access(out+'/'+stage+suffix))
assert.equal(adb('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29')
assert.equal(adb('shell','getprop','ro.build.version.sdk').toString().trim(),'29');assert.equal(adb('shell','getprop','sys.boot_completed').toString().trim(),'1')
adb('shell','am','force-stop',app)
const fixture='com.longyuye.mdreader.storagefixture'
const hashes=(pkg,folders)=>Object.fromEntries(adb('exec-out','run-as',pkg,'find',...folders,'-type','f','-exec','sha256sum','{}',';').toString().trim().split(/\r?\n/).filter(Boolean).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m,line);return[m[2],m[1]]}))
const report={stage,time:new Date().toISOString(),files:hashes(app,['files','shared_prefs']),provider:hashes(fixture,['files']),settings:{},passed:false}
for(const [pkg,name,folders]of [[app,'private',['files','shared_prefs','app_webview']],[fixture,'fixture',['files']]])await writeFile(out+'/'+stage+'-'+name+'.tar',adb('exec-out','run-as',pkg,'tar','-cf','-',...folders))
for(const [ns,key]of [['secure','enabled_accessibility_services'],['secure','accessibility_enabled'],['secure','default_input_method'],['system','font_scale'],['system','accelerometer_rotation'],['system','user_rotation'],['global','wifi_on'],['global','mobile_data'],['global','webview_provider'],['secure','ui_night_mode']])report.settings[ns+'/'+key]=adb('shell','settings','get',ns,key).toString().trim()
report.night=adb('shell','cmd','uimode','night').toString().trim();report.adb=adb('shell','id').toString().trim();assert.match(report.adb,/^uid=2000\(shell\)/)
await writeFile(out+'/'+stage+'-webview.txt',adb('shell','dumpsys','webviewupdate'))
report.recent=JSON.parse(adb('exec-out','run-as',app,'cat','files/recent-v1.json'))
assert.equal(Object.keys(report.files).filter(f=>f.startsWith('files/drafts-v1/')).length,9);assert.equal(Object.keys(report.files).filter(f=>f.startsWith('files/library/')).length,103)
if(stage==='baseline'){
 assert.equal(Object.keys(report.files).length,175);assert.equal(Object.keys(report.provider).length,302)
 const path=adb('shell','pm','path',app).toString().trim().replace(/^package:/,'');report.apk=createHash('sha256').update(adb('exec-out','cat',path)).digest('hex');assert.equal(report.apk,'d399e1cbd157befba89f396d58bd59c38eb3c4fe770bd38a926f6f50bc4ee896')
}else{
 const before=JSON.parse(await readFile(out+'/baseline.json','utf8'));report.changes=[]
 for(const [name,hash]of Object.entries(before.files)){assert.ok(Object.hasOwn(report.files,name),name);if(report.files[name]!==hash){report.changes.push(name);if(name==='files/profileInstalled'){const bytes=adb('exec-out','run-as',app,'cat',name);assert.equal(bytes.length,24);assert.equal(bytes.readUInt32BE(0),1);const stamp=new Date(Number(bytes.readBigInt64BE(8))).toISOString(),installed=/lastUpdateTime=(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(adb('shell','dumpsys','package',app).toString())?.[1];assert.equal(stamp.slice(0,19).replace('T',' '),installed);report.profileInstalled={recordUpdateTime:stamp,packageUpdateTime:installed}}else assert.fail(name+' changed')}}
 assert.deepEqual(Object.keys(report.files).sort(),Object.keys(before.files).sort());assert.deepEqual(report.provider,before.provider);assert.deepEqual(report.settings,before.settings);assert.equal(report.night,before.night);assert.deepEqual(report.recent,before.recent)
}
report.passed=true;await writeFile(out+'/'+stage+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({out,stage,passed:true,files:Object.keys(report.files).length,provider:Object.keys(report.provider).length,changes:report.changes}))
