import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {mobileHelpTopics} from '../src/mobile/mobileHelp.ts'
import {mobileAdb as adb} from './mobile-native-webview-cdp.mjs'
import {observeNative,clickNative,nativePause,captureNative} from './mobile-native-accessibility.mjs'
const [out,stage='initial']=process.argv.slice(2);assert.ok(out&&/^[a-z0-9-]+$/.test(stage));const file=stage==='initial'?'native-short.json':'native-short-'+stage+'.json',prefix=stage==='initial'?'axf-short':'axf-short-'+stage,photo=name=>stage==='initial'?name:stage+'-'+name;await assert.rejects(access(out+'/'+file))
const keys=['font_scale','accelerometer_rotation','user_rotation'],before={},baseline=JSON.parse(await readFile(out+'/baseline.json','utf8'))
for(const key of keys){before[key]=adb('shell','settings','get','system',key).toString().trim();assert.equal(before[key],baseline.settings['system/'+key])}
const report={time:new Date().toISOString(),scope:'Actual API29 system font scale 2 and landscape, ordinary native Tab/PageDown plus TalkBack focus; no physical-touch or spoken-audio assertion.',before,orientationSamples:[],passed:false}
const body=tree=>tree.nodes.find(n=>n.visible&&n.text.includes(mobileHelpTopics.library.paragraphs[0]))
try{
 const home=await observeNative(out,prefix+'-before',['资料库说明'])
 clickNative('资料库说明',home.native);await nativePause(350)
 adb('shell','settings','put','system','accelerometer_rotation','0');adb('shell','settings','put','system','user_rotation','1');adb('shell','settings','put','system','font_scale','2')
 for(let n=0;n<40;n++){await nativePause(250);const bytes=adb('exec-out','screencap','-p'),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);report.orientationSamples.push({width,height});if(n===0)await writeFile(out+'/'+photo('short-first-frame')+'.png',bytes);if(width>height)break;if(n===39)throw Error('Landscape not applied')}
 await nativePause(700)
 let current=await observeNative(out,prefix+'-help-ready',[],{refresh:true})
 if(!current.native.nodes.some(n=>n.text==='关闭说明')){clickNative('资料库说明',current.native);await nativePause(350);current=await observeNative(out,prefix+'-help-reopened',['关闭说明'])}
 assert.ok(body(current.native),'Real help text stays in the native tree')
 const close=current.native.nodes.find(n=>n.visible&&n.clickable&&n.text==='关闭说明');assert.ok(close);report.close=close.bounds
 const rectangle=close.bounds.split(' ').map(Number);assert.ok(rectangle[2]-rectangle[0]>=132&&rectangle[3]-rectangle[1]>=132)
 // Keep keyboard scrolling: focus reaches the existing unnamed scroll body.
 for(let n=0;n<4;n++){
  if(body(current.native)?.focused)break
  adb('shell','input','keyevent','KEYCODE_TAB');await nativePause(220);current=await observeNative(out,prefix+'-tab-'+n,[],{refresh:true})
 }
 assert.equal(body(current.native).focused,true,'The scroll body must remain a keyboard stop')
 report.beforeScroll={bounds:body(current.native).bounds,close:current.native.nodes.find(n=>n.text==='关闭说明').bounds}
 await captureNative(out,photo('short-scroll-before'))
 adb('shell','input','keyevent','KEYCODE_PAGE_DOWN');await nativePause(350)
 current=await observeNative(out,prefix+'-pagedown',[...mobileHelpTopics.library.paragraphs,'关闭说明'],{refresh:true})
 report.afterScroll={bounds:body(current.native).bounds,close:current.native.nodes.find(n=>n.text==='关闭说明').bounds,focused:body(current.native).focused}
 assert.deepEqual(report.afterScroll.bounds,report.beforeScroll.bounds);assert.equal(report.afterScroll.close,report.beforeScroll.close);assert.equal(report.afterScroll.focused,true)
 await captureNative(out,photo('short-scroll-after'))
 adb('shell','input','keyevent','4');await nativePause(350)
 const returned=await observeNative(out,prefix+'-return',['资料库说明'],{refresh:true})
 assert.ok(returned.native.nodes.some(n=>n.accessibilityFocused&&n.text==='资料库说明'))
 report.passed=true
}catch(error){report.failure=String(error.stack||error);throw error}
finally{
 for(const key of keys.filter(key=>key!=='font_scale')){if(before[key]==='null')adb('shell','settings','delete','system',key);else adb('shell','settings','put','system',key,before[key])}
 // Let the effective scale settle before removing an originally absent key.
 // Deleting directly while scale=2 lets Android materialize the default 1.0.
 adb('shell','settings','put','system','font_scale',before.font_scale==='null'?'1.0':before.font_scale)
 await nativePause(700);if(before.font_scale==='null')adb('shell','settings','delete','system','font_scale')
 await nativePause(500)
 report.after={};for(const key of keys)report.after[key]=adb('shell','settings','get','system',key).toString().trim()
 report.settingsRestored=JSON.stringify(report.after)===JSON.stringify(before);await writeFile(out+'/'+file,JSON.stringify(report,null,2));assert.deepEqual(report.after,before)
}
console.log(JSON.stringify({out,passed:report.passed,settingsRestored:report.settingsRestored}))
