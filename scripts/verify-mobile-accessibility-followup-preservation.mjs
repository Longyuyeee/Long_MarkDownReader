import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {mobileAdb as adb,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
const [out,stage]=process.argv.slice(2);assert.ok(out&&(stage==='baseline'||/^closeout(?:-[a-z0-9]+)*$/.test(stage)));await mkdir(out,{recursive:true})
for(const suffix of ['.json','-private.tar','-fixture.tar'])await assert.rejects(access(out+'/'+stage+suffix))
assert.equal(adb('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(adb('shell','getprop','ro.build.version.sdk').toString().trim(),'29');assert.equal(adb('shell','getprop','sys.boot_completed').toString().trim(),'1')
adb('shell','am','force-stop',app)
const fixture='com.longyuye.mdreader.storagefixture',sha=b=>createHash('sha256').update(b).digest('hex')
const hashes=(pkg,folders)=>Object.fromEntries(adb('exec-out','run-as',pkg,'find',...folders,'-type','f','-exec','sha256sum','{}',';').toString().trim().split(/\r?\n/).filter(Boolean).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m,line);return[m[2],m[1]]}))
const report={stage,time:new Date().toISOString(),files:hashes(app,['files','shared_prefs']),provider:hashes(fixture,['files']),settings:{},apk:{},passed:false}
for(const [pkg,name,folders]of [[app,'private',['files','shared_prefs','app_webview']],[fixture,'fixture',['files','shared_prefs']]]){
 // Some fixture versions have no shared_prefs directory.
 const actual=pkg===fixture?['files']:folders
 await writeFile(out+'/'+stage+'-'+name+'.tar',adb('exec-out','run-as',pkg,'tar','-cf','-',...actual))
 const path=adb('shell','pm','path',pkg).toString().trim().replace(/^package:/,'');const bytes=adb('exec-out','cat',path);report.apk[pkg]=sha(bytes);if(stage==='baseline')await writeFile(out+'/'+stage+'-'+name+'.apk',bytes)
}
for(const [ns,key]of [['secure','enabled_accessibility_services'],['secure','accessibility_enabled'],['secure','touch_exploration_enabled'],['secure','accessibility_shortcut_target_service'],['secure','accessibility_soft_keyboard_mode'],['secure','speak_password'],['secure','default_input_method'],['secure','show_ime_with_hard_keyboard'],['secure','ui_night_mode'],['system','font_scale'],['system','accelerometer_rotation'],['system','user_rotation'],['global','wifi_on'],['global','mobile_data'],['global','webview_provider']])report.settings[ns+'/'+key]=adb('shell','settings','get',ns,key).toString().trim()
report.night=adb('shell','cmd','uimode','night').toString().trim();report.adb=adb('shell','id').toString().trim();assert.match(report.adb,/^uid=2000\(shell\)/)
report.recent=JSON.parse(adb('exec-out','run-as',app,'cat','files/recent-v1.json'))
await writeFile(out+'/'+stage+'-webview.txt',adb('shell','dumpsys','webviewupdate'))
await writeFile(out+'/'+stage+'-services.txt',adb('shell','dumpsys','accessibility'))
if(stage==='baseline'){
 assert.equal(report.apk[app],'e24c2d9e52174de7af8542a5941a1a875db207bcd4f78508a1dcc68c452338db');assert.equal(report.apk[fixture],'2e5465aedd8c6abda1de6ad8cd6b77f248d524b5a1b63edf862320005b8f2916')
 assert.equal(Object.keys(report.files).length,175);assert.equal(Object.keys(report.provider).length,302)
 assert.equal(adb('shell','pm','list','packages','com.google.android.marvin.talkback').toString().trim(),'')
}else{
 const before=JSON.parse(await readFile(out+'/baseline.json','utf8'));report.changes=[]
 const build=JSON.parse((await readFile('release-artifacts/mobile-debug/x86_64/build-record.json','utf8')).replace(/^\uFEFF/,''))
 assert.equal(report.apk[app],build.sha256);assert.equal(report.apk[fixture],before.apk[fixture])
 for(const [name,hash]of Object.entries(before.files)){assert.ok(Object.hasOwn(report.files,name),name);if(report.files[name]!==hash){report.changes.push(name);if(name==='files/profileInstalled'){const bytes=adb('exec-out','run-as',app,'cat',name);assert.equal(bytes.length,24);assert.equal(bytes.readUInt32BE(0),1);const stamp=new Date(Number(bytes.readBigInt64BE(8))).toISOString(),installed=/lastUpdateTime=(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(adb('shell','dumpsys','package',app).toString())?.[1];assert.equal(stamp.slice(0,19).replace('T',' '),installed)}else assert.fail(name+' changed')}}
 assert.deepEqual(Object.keys(report.files).sort(),Object.keys(before.files).sort())
 for(const [name,hash]of Object.entries(before.provider))assert.equal(report.provider[name],hash,'provider '+name)
 report.newProviderFiles=Object.keys(report.provider).filter(name=>!Object.hasOwn(before.provider,name))
 for(const name of report.newProviderFiles){assert.match(name,/^files\/a11y-snapshot-axf-[a-z0-9-]+\.json$/);const token=name.slice('files/a11y-snapshot-'.length,-5);assert.equal(sha(await readFile(out+'/'+token+'.native.json')),report.provider[name])}
 assert.deepEqual(report.settings,before.settings);assert.equal(report.night,before.night);assert.deepEqual(report.recent,before.recent)
 assert.equal(adb('shell','pm','list','packages','com.google.android.marvin.talkback').toString().trim(),'')
}
assert.equal(Object.keys(report.files).filter(n=>n.startsWith('files/library/')).length,103);assert.equal(Object.keys(report.files).filter(n=>n.startsWith('files/drafts-v1/')).length,9)
report.passed=true;await writeFile(out+'/'+stage+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({out,stage,files:Object.keys(report.files).length,provider:Object.keys(report.provider).length,changes:report.changes,passed:true}))
