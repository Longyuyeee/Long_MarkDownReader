import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {mobileAdb as adb,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
const [out]=process.argv.slice(2);assert.ok(out);await assert.rejects(access(out+'/emulator-closeout.json'))
const before=JSON.parse(await readFile(out+'/baseline.json','utf8')),short=JSON.parse(await readFile(out+'/native-short-settled.json','utf8'));assert.equal(short.passed,true);assert.equal(short.settingsRestored,true)
adb('shell','am','force-stop',app)
adb('shell','settings','put','secure','enabled_accessibility_services',before.settings['secure/enabled_accessibility_services'])
adb('shell','settings','put','secure','accessibility_enabled',before.settings['secure/accessibility_enabled'])
await new Promise(r=>setTimeout(r,1200))
const result=adb('uninstall','com.google.android.marvin.talkback').toString();assert.match(result,/Success/)
await new Promise(r=>setTimeout(r,700))
const settings=[]
for(const [name,value]of Object.entries(before.settings)){
 const [ns,key]=name.split('/'),current=adb('shell','settings','get',ns,key).toString().trim()
 if(current!==value){if(value==='null')adb('shell','settings','delete',ns,key);else adb('shell','settings','put',ns,key,value)}
 settings.push({name,before:value,observedBeforeRestore:current})
}
await new Promise(r=>setTimeout(r,700))
for(const item of settings){const [ns,key]=item.name.split('/');item.after=adb('shell','settings','get',ns,key).toString().trim();assert.equal(item.after,item.before,item.name)}
await writeFile(out+'/settings-closeout.json',JSON.stringify({time:new Date().toISOString(),temporaryTalkBackRemoved:true,adbdUid:adb('shell','id','-u').toString().trim(),settings,passed:true},null,2))
for(const [command,args]of [
 ['python',['scripts/restore-mobile-appearance-origin-cache.py',out,'closeout']],
 [process.execPath,['scripts/verify-mobile-accessibility-followup-preservation.mjs',out,'closeout-final']]
]){
 const run=spawnSync(command,args,{timeout:90000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stdout?.toString()+run.stderr?.toString());console.log(run.stdout.toString())
}
const forwards=adb('forward','--list').toString();assert.ok(!forwards.includes('tcp:9559')&&!forwards.includes('tcp:9560'))
assert.equal(adb('shell','id','-u').toString().trim(),'2000')
adb('shell','sync');assert.equal(adb('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');adb('emu','kill')
await writeFile(out+'/emulator-closeout.json',JSON.stringify({time:new Date().toISOString(),avd:'LongEdit_Compat_API29',synced:true,ownedForwardsRemoved:true,adbdUid:2000,temporaryTalkBackRemoved:true,stopped:true},null,2))
