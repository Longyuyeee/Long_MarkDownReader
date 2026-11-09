import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {mobileHelpTopics} from '../src/mobile/mobileHelp.ts'
import {mobileAdb as adb} from './mobile-native-webview-cdp.mjs'
import {observeNative,clickNative,sendTalkBackKey,nativePause} from './mobile-native-accessibility.mjs'
const [out,stage='basic']=process.argv.slice(2);assert.ok(out&&/^[a-z0-9-]+$/.test(stage));await assert.rejects(access(out+'/talkback-'+stage+'.json'))
const report={stage,time:new Date().toISOString(),scope:'Main app with actual TalkBack kernel keyboard traversal/activation and Android Back; native service snapshots do not attach UiAutomation or CDP. No audio-quality or physical-finger assertion.',checks:[],steps:[],passed:false}
let state
async function snap(name,expected=[]){
 const result=await observeNative(out,'axf-new-'+stage+'-'+name,expected,{refresh:true})
 state=result.native;report.steps.push({name,nodes:state.nodes.length,focus:state.nodes.filter(n=>n.accessibilityFocused).map(n=>({text:n.text,description:n.description,bounds:n.bounds})),labels:result.report.visibleLabels})
 return result
}
async function button(label,name,expected){report.steps.push({action:clickNative(label,state)});await nativePause(350);await snap(name,expected)}
async function focused(label,name){
 for(let i=0;i<6;i++){
  if(state.nodes.some(n=>n.accessibilityFocused&&(n.text===label||n.description===label)))return
  report.steps.push(sendTalkBackKey('next'));await nativePause(220);await snap(name+'-'+i)
 }assert.fail('TalkBack did not reach '+label)
}
async function paragraphs(topic,name){
 const expected=mobileHelpTopics[topic].paragraphs,seen=new Set()
 for(let i=0;i<12;i++){
  for(const node of state.nodes.filter(n=>n.accessibilityFocused))for(const text of expected)if((node.text+' '+node.description).includes(text))seen.add(text)
  if(seen.size===expected.length){report.checks.push({task:topic,paragraphs:expected.length,focusedParagraphs:[...seen],method:'Actual TalkBack next-item traversal reached native text, not an author-supplied content label'});return}
  report.steps.push(sendTalkBackKey('next'));await nativePause(220);await snap(name+'-'+i)
 }assert.fail('TalkBack paragraph traversal incomplete: '+topic+' '+seen.size+'/'+expected.length)
}
async function back(name,expected){adb('shell','input','keyevent','4');await nativePause(350);await snap(name,expected)}
try{
 assert.ok(!adb('forward','--list').toString().includes('tcp:9559'));assert.ok(!adb('forward','--list').toString().includes('tcp:9560'))
 if(stage!=='library'){
 await snap('home',['继续阅读'])
 await button('设置','settings',['外观'])
 await button('外观 跟随系统','appearance',['返回设置','主题'])
 await button('主题 跟随系统','theme',['跟随系统','浅色','深色'])
 assert.ok(!state.nodes.some(n=>n.visible&&n.text==='返回设置'),'Theme chooser shields its parent page')
 await focused('外观说明','theme-focus')
 report.steps.push(sendTalkBackKey('activate'));await nativePause(350)
 await snap('appearance-help',[...mobileHelpTopics.appearance.paragraphs,'关闭说明'])
 assert.ok(!state.nodes.some(n=>n.visible&&['浅色','深色','跟随系统'].includes(n.text)),'Help shields the theme choices')
 await paragraphs('appearance','appearance-text')
 await back('theme-return',['浅色','深色','外观说明'])
 assert.ok(state.nodes.some(n=>n.accessibilityFocused&&n.text==='外观说明'),'TalkBack focus returns to the question-mark opener')
 await back('appearance-return',['返回设置','主题'])
 assert.ok(state.nodes.some(n=>n.accessibilityFocused&&n.text==='主题 跟随系统'),'TalkBack focus returns to the theme row')
 await back('settings-return',['外观'])
 report.checks.push({task:'nested-back',result:'Android Back closes Help then Theme, restores actual TalkBack opener focus, then returns to Settings'})
 }
 // Settings root returns to Library through the real Android Back contract.
 // Its newly remounted footer was absent from the first service snapshot; do
 // not pretend a missing named native button was successfully clicked.
 await back('library',['资料库说明','继续阅读'])
 await button('资料库说明','library-help',[...mobileHelpTopics.library.paragraphs,'关闭说明'])
 await paragraphs('library','library-text')
 await back('library-return',['资料库说明','继续阅读'])
 assert.ok(state.nodes.some(n=>n.accessibilityFocused&&n.text==='资料库说明'))
 report.passed=true
}catch(error){report.failure=String(error.stack||error);throw error}
finally{await writeFile(out+'/talkback-'+stage+'.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify({out,stage,checks:report.checks.length,steps:report.steps.length,passed:report.passed}))
