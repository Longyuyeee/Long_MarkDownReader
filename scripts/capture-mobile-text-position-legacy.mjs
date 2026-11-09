import assert from 'node:assert/strict'
import {writeFile,access} from 'node:fs/promises'
import {identity,id} from './mobile-text-position-fixture.mjs'
import {connectMobileWebView,mobileAdb as adb,mobileTestPackage as app} from './mobile-native-webview-cdp.mjs'
const out=process.argv[2];assert.ok(out);await assert.rejects(access(out+'/legacy.json'));adb('shell','monkey','-p',app,'-c','android.intent.category.LAUNCHER','1');let c
try{for(let i=0;i<40;i++)try{c=await connectMobileWebView();break}catch(e){if(i===39)throw e;await new Promise(r=>setTimeout(r,250))}const raw=await c.evaluate(()=>localStorage.getItem('longedit-mobile-reading-v1'));if(raw!==null)assert.equal(typeof JSON.parse(raw),'object');await writeFile(out+'/legacy.json',JSON.stringify({time:new Date().toISOString(),id,raw},null,2));console.log(JSON.stringify({legacyRecords:raw===null?0:Object.keys(JSON.parse(raw)).length,current:raw===null?null:JSON.parse(raw)[id]}))}finally{c?.close();adb('shell','am','force-stop',app)}
