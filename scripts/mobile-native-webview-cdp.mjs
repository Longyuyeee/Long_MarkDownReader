// Development bridge for a dedicated emulator. DOM/CDP is not a native accessibility oracle.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
export const mobileTestPackage='com.longyuye.mdreader.mobile.dev'
export const mobileTestSerial=process.env.LONGEDIT_MOBILE_EMULATOR_SERIAL||'emulator-5558'
assert.match(mobileTestSerial,/^emulator-\d{4,5}$/)
const consolePort=Number(mobileTestSerial.slice('emulator-'.length));assert.ok(consolePort>=1024&&consolePort<=65534&&consolePort%2===0)
export function mobileAdb(...args){const r=spawnSync('E:/Android/Sdk/platform-tools/adb.exe',['-s',mobileTestSerial,...args],{timeout:30000,maxBuffer:160*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
export async function connectMobileWebView(){
 assert.equal(mobileAdb('emu','avd','name').toString().trim().split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29');assert.equal(mobileAdb('shell','getprop','ro.build.version.sdk').toString().trim(),'29')
 assert.match(mobileAdb('shell','dumpsys','webviewupdate').toString(),/Current WebView package \(name, version\): \(com.google.android.webview, 124\.0\.6367\.219\)/)
 const pid=mobileAdb('shell','pidof',mobileTestPackage).toString().trim();assert.match(pid,/^\d+$/)
 assert.ok(!mobileAdb('forward','--list').toString().includes('tcp:9559'),'Port already owned')
 const socket='webview_devtools_remote_'+pid;assert.ok(mobileAdb('shell','cat','/proc/net/unix').toString().includes('@'+socket))
 mobileAdb('forward','tcp:9559','localabstract:'+socket)
 let ws,sequence=0;const pending=new Map()
 const close=()=>{ws?.close();mobileAdb('forward','--remove','tcp:9559')}
 try{
  const pages=await(await fetch('http://127.0.0.1:9559/json')).json(),page=pages.find(p=>/^https?:\/\/(?:tauri\.localhost|localhost)(?:[/:]|$)/.test(p.url));assert.ok(page,JSON.stringify(pages.map(p=>({url:p.url,title:p.title}))))
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
  ws.addEventListener('message',event=>{const data=JSON.parse(String(event.data));const request=pending.get(data.id);if(!request)return;pending.delete(data.id);clearTimeout(request.timer);data.error?request.reject(Error(JSON.stringify(data.error))):request.resolve(data.result)})
  function command(method,params){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},25000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})}
  async function evaluate(fn,arg){const r=await command('Runtime.evaluate',{expression:`(${fn})(${JSON.stringify(arg)??'undefined'})`,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
  assert.match(await evaluate(()=>location.href),/^https?:\/\/(?:tauri\.localhost|localhost)(?:[/:]|$)/)
  return {evaluate,command,close,async invoke(payload){return evaluate(p=>window.__TAURI_INTERNALS__.invoke('plugin:mobile-storage|execute',{payload:p}),payload)}}
 }catch(error){close();throw error}
}
