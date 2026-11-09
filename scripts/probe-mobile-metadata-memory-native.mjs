import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {mobileAdb as adb,mobileTestPackage as app,connectMobileWebView} from './mobile-native-webview-cdp.mjs'
const [out]=process.argv.slice(2);assert.ok(out);await access(out+'/baseline.json');await assert.rejects(access(out+'/old-protocol-probe.json'))
const baseline=JSON.parse(await readFile(out+'/baseline.json','utf8'));assert.equal(baseline.passed,true)
const before=adb('exec-out','run-as',app,'cat','files/source-reading-v1.json')
const report={time:new Date().toISOString(),properties:{},passed:false}
for(const key of ['dalvik.vm.heapgrowthlimit','dalvik.vm.heapsize','dalvik.vm.heapstartsize','ro.config.low_ram'])report.properties[key]=adb('shell','getprop',key).toString().trim()
adb('shell','monkey','-p',app,'-c','android.intent.category.LAUNCHER','1');await new Promise(r=>setTimeout(r,5000))
let c
try{
 c=await connectMobileWebView();report.pid=adb('shell','pidof',app).toString().trim();await writeFile(out+'/old-protocol-mem-before.txt',adb('shell','dumpsys','meminfo',app))
 report.legacy=await c.evaluate(()=>Object.fromEntries(['longedit-mobile-theme-v1','longedit-mobile-source-reading-v1','longedit-mobile-reading-v1'].map(key=>[key,localStorage.getItem(key)])))
 await writeFile(out+'/legacy-baseline.json',JSON.stringify(report.legacy,null,2))
 report.result=await c.evaluate(async()=>{try{await window.__TAURI_INTERNALS__.invoke('plugin:mobile-storage|execute',{payload:{op:'writeSourceReading',content:'x'.repeat(5*1024*1024+1),expectedRevision:'missing'}});return{resolved:true}}catch(error){return{resolved:false,error:String(error)}}})
 await writeFile(out+'/old-protocol-mem-after.txt',adb('shell','dumpsys','meminfo',app))
 await writeFile(out+'/old-protocol-logcat.txt',adb('logcat','-d','-v','threadtime','--pid='+report.pid))
 assert.equal(report.result.resolved,false);assert.deepEqual(adb('exec-out','run-as',app,'cat','files/source-reading-v1.json'),before);report.passed=true
}catch(error){report.error=String(error);throw error}finally{c?.close();await writeFile(out+'/old-protocol-probe.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify(report,null,2))
