// Independent test WebView only. CDP sets prototype content; Android service reads nodes.
import assert from 'node:assert/strict'
import {readFile,writeFile,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {mobileAdb as adb,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
import {observeNative,nativePause,fixturePackage} from './mobile-native-accessibility.mjs'
const [out,stage='initial']=process.argv.slice(2);assert.ok(out&&/^[a-z0-9-]+$/.test(stage));const file=stage==='initial'?'control-help-prototypes.json':'control-help-prototypes-'+stage+'.json',prefix=stage==='initial'?'axf-control':'axf-control-'+stage;await assert.rejects(access(out+'/'+file))
const folder='docs/design/mobile-native-accessibility-v1/prototype',report={time:new Date().toISOString(),scope:'Independent fixture WebView; no main-app CDP or storage bridge. CDP loads frozen code-native prototypes. Android AccessibilityService supplies the actual node tree; TalkBack acceptance is separate.',variants:[],passed:false}
adb('shell','am','start','--activity-clear-top','-n',fixturePackage+'/.AccessibilityControlActivity','--es','mode','frontend-inspect')
await nativePause(1500)
await observeNative(out,prefix+'-pre-cdp',[],{control:true,allowFailure:true})
const pid=adb('shell','pidof',fixturePackage).toString().trim();assert.match(pid,/^\d+$/)
const socket='webview_devtools_remote_'+pid;assert.ok(adb('shell','cat','/proc/net/unix').toString().includes('@'+socket));assert.ok(!adb('forward','--list').toString().includes('tcp:9560'))
let ws,sequence=0,forward=false;const pending=new Map()
try{
 adb('forward','tcp:9560','localabstract:'+socket);forward=true
 const pages=await(await fetch('http://127.0.0.1:9560/json')).json(),visible=pages.filter(p=>{try{return p.type==='page'&&JSON.parse(p.description).visible}catch{return false}})
 const page=pages.find(p=>p.url.startsWith('https://control.invalid/'))??(visible.length===1?visible[0]:pages.length===1?pages[0]:null)
 report.controlTargets=pages.map(p=>({id:p.id,type:p.type,url:p.url.slice(0,100)}));assert.ok(page,JSON.stringify(report.controlTargets))
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
 ws.addEventListener('message',event=>{const data=JSON.parse(String(event.data)),request=pending.get(data.id);if(!request)return;pending.delete(data.id);clearTimeout(request.timer);data.error?request.reject(Error(JSON.stringify(data.error))):request.resolve(data.result)})
 const command=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP prototype timeout '+method))},25000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})
 if(stage!=='initial')await command('Page.setBypassCSP',{enabled:true}) // Isolated test WebView only.
 for(const variant of ['before','candidate']){
  const html=await readFile(folder+'/'+variant+'.html')
  if(stage==='initial'){
   const navigation=await command('Page.navigate',{url:'data:text/html;base64,'+html.toString('base64')});assert.ok(!navigation.errorText,navigation.errorText)
  }else{
   const replacement=await command('Runtime.evaluate',{expression:'(html=>{document.open();document.write(html);document.close();return true})('+JSON.stringify(html.toString())+')',returnByValue:true});assert.ok(!replacement.exceptionDetails)
  }
  await nativePause(650)
  const state=await command('Runtime.evaluate',{expression:"JSON.stringify({ready:document.readyState,help:!!document.querySelector('.mobile-help-dialog'),origin:location.origin})",returnByValue:true});assert.ok(!state.exceptionDetails);assert.equal(JSON.parse(state.result.value).help,true)
  const tree=await observeNative(out,prefix+'-help-'+variant,['跟随系统会随系统深浅色变化'],{control:true,allowFailure:true,refresh:true})
  report.variants.push({variant,prototypeSha256:createHash('sha256').update(html).digest('hex'),assertionsPassed:tree.report.assertionsPassed,nodes:tree.report.nodeCount,visibleLabels:tree.report.visibleLabels,failure:tree.report.failure??null})
 }
 assert.equal(report.variants[0].assertionsPassed,false,'The labelled old scroll body should reproduce the missing text')
 assert.equal(report.variants[1].assertionsPassed,true,'The candidate must expose real paragraphs through Android')
 report.passed=true
}catch(error){report.failure=String(error.stack||error);throw error}
finally{
 ws?.close();if(forward)adb('forward','--remove','tcp:9560')
 await writeFile(out+'/'+file,JSON.stringify(report,null,2))
 adb('shell','monkey','-p',app,'-c','android.intent.category.LAUNCHER','1')
}
console.log(JSON.stringify(report))
