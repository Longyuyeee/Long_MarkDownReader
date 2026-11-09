import assert from 'node:assert/strict'
import {writeFile,access} from 'node:fs/promises'
import {connectMobileWebView,mobileAdb as adb,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
const out=process.argv[2];assert.ok(out);await assert.rejects(access(out+'/legacy.json'));adb('shell','monkey','-p',app,'-c','android.intent.category.LAUNCHER','1');let c
try{for(let i=0;i<40;i++)try{c=await connectMobileWebView();break}catch(e){if(i===39)throw e;await new Promise(r=>setTimeout(r,250))}const raw=await c.evaluate(()=>localStorage.getItem('longedit-mobile-theme-v1'));if(raw!==null)assert.equal(typeof raw,'string');await writeFile(out+'/legacy.json',JSON.stringify({time:new Date().toISOString(),raw},null,2));await c.evaluate(()=>localStorage.setItem('longedit-mobile-theme-v1','dark'));await new Promise(r=>setTimeout(r,6000));console.log(JSON.stringify({out,originalTheme:raw,seeded:'dark'}))}finally{c?.close();adb('shell','am','force-stop',app)}
