// Dedicated emulator helper. Native nodes/actions only; no DOM/CDP/UiAutomation.
import assert from 'node:assert/strict'
import {readFile,writeFile,access,readdir} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {mobileAdb as adb,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
export const fixturePackage='com.longyuye.mdreader.storagefixture'
export const nativePause=ms=>new Promise(r=>setTimeout(r,ms))
export function sendTalkBackKey(action){
 assert.ok(['next','previous','activate'].includes(action))
 assert.equal(adb('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29')
 assert.equal(adb('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
 assert.equal(adb('shell','id','-u').toString().trim(),'2000')
 const bound=/Bound services:\{([\s\S]*?)\}\s*Enabled services:/.exec(adb('shell','dumpsys','accessibility').toString())?.[1]??''
 assert.match(bound,/Service\[label=TalkBack,/)
 const device='/dev/input/event12',description=adb('shell','getevent','-lp',device).toString()
 assert.match(description,/AT Translated Set 2 keyboard/);assert.match(description,/KEY_LEFTALT/)
 assert.equal(adb('shell','su','0','id','-u').toString().trim(),'0')
 adb('shell','su','0','/data/local/tmp/longedit-talkback-keyboard',action,device)
 return{action,device,method:'TalkBack Alt+arrow/Enter via scoped kernel keyboard input',adbdUid:2000}
}
export async function observeNative(out,stage,expected=[],options={}){
 assert.match(stage,/^[a-z0-9-]{1,48}$/)
 assert.ok(!(await readdir(out)).some(name=>name.startsWith(stage+'.')),'Preserve existing stage evidence; use a new name')
 const args=['scripts/observe-mobile-accessibility-service.py','--serial','emulator-5558','--output',out,'--stage',stage,'--expect-webview','com.google.android.webview@124.0.6367.219']
 for(const text of expected)args.push('--expect',text)
 if(options.control)args.push('--target','control')
 if(options.refresh)args.push('--refresh','--refresh-descendants')
 const result=spawnSync('python',args,{timeout:45000,maxBuffer:1024*1024})
 await writeFile(out+'/'+stage+'.log',Buffer.concat([result.stdout??Buffer.alloc(0),result.stderr??Buffer.alloc(0)]),{flag:'wx'})
 const report=JSON.parse(await readFile(out+'/'+stage+'.json','utf8'))
 if(!options.allowFailure)assert.equal(result.status,0,report.failure||result.stderr?.toString())
 return{report,native:JSON.parse(await readFile(out+'/'+stage+'.native.json','utf8'))}
}
export function clickNative(label,snapshot){
 const candidates=snapshot.nodes.filter(n=>n.visible&&n.enabled&&n.clickable&&n.class==='android.widget.Button'&&(n.text===label||n.description===label))
 assert.equal(candidates.length,1,'Unique visible native button required: '+label)
 // adb shell joins argv for the remote shell, so quote the exact label there.
 const quoted="'"+label.replaceAll("'","'\\''")+"'"
 const result=adb('shell','am','broadcast','-a',fixturePackage+'.TEST_CLICK','-p',fixturePackage,'--es','text',quoted).toString()
 assert.match(result,/Broadcast completed: result=1(?:\D|$)/,result)
 return{label,bounds:candidates[0].bounds,nativeAction:'ACTION_CLICK',package:app}
}
export async function captureNative(out,name){
 assert.match(name,/^[a-z0-9-]+$/);await assert.rejects(access(out+'/'+name+'.png'))
 await writeFile(out+'/'+name+'.png',adb('exec-out','screencap','-p'))
}
