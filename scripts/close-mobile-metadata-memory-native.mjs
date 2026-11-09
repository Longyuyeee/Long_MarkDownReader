import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {mobileAdb as adb,mobileTestPackage as app,connectMobileWebView} from './mobile-native-webview-cdp.mjs'
const [out]=process.argv.slice(2);assert.ok(out);await assert.rejects(access(out+'/legacy-closeout.json'))
const before=JSON.parse(await readFile(out+'/legacy-baseline.json','utf8'));assert.equal(JSON.parse(await readFile(out+'/cold-resume-native.json','utf8')).metadataRestored,true)
adb('shell','monkey','-p',app,'-c','android.intent.category.LAUNCHER','1');let c
try{
 for(let n=0;n<40;n++)try{c=await connectMobileWebView();break}catch(error){if(n===39)throw error;await new Promise(r=>setTimeout(r,200))}
 const after=await c.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),Object.keys(before));assert.deepEqual(after,before)
 await new Promise(r=>setTimeout(r,6000))
 assert.deepEqual(await c.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),Object.keys(before)),before)
 await writeFile(out+'/legacy-closeout.json',JSON.stringify({time:new Date().toISOString(),before,after,passed:true},null,2))
}finally{c?.close();adb('shell','am','force-stop',app)}
for(const [command,args]of [
 ['python',['scripts/restore-mobile-appearance-origin-cache.py',out,'closeout']],
 [process.execPath,['scripts/verify-mobile-metadata-memory-preservation.mjs',out,'closeout-final']]
]){
 const result=spawnSync(command,args,{timeout:90000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stdout?.toString()+result.stderr?.toString());console.log(result.stdout.toString())
}
assert.ok(!adb('forward','--list').toString().includes('tcp:9559'))
adb('shell','sync');assert.equal(adb('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');adb('emu','kill')
await writeFile(out+'/emulator-closeout.json',JSON.stringify({time:new Date().toISOString(),synced:true,ownedForwardRemoved:true,avd:'LongEdit_Compat_API29',stopped:true},null,2))
