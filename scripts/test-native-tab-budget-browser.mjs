import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v1229-native-tab-budget',browser=await chromium.launch({args:['--no-proxy-server']}),page=await browser.newPage(),checks=[]
try{
 await page.setContent(Array.from({length:240},(_,i)=>`<button>Tab ${i}</button>`).join('')+'<button hidden>hidden</button><button disabled>disabled</button><button id="reload">重新读取</button><button id="unreachable" tabindex="-1">unreachable</button>')
 await page.evaluate(()=>{window.keys=[];window.clicked=false;document.addEventListener('keydown',e=>window.keys.push({key:e.key,trusted:e.isTrusted}));document.querySelector('#reload').addEventListener('click',e=>window.clicked=e.isTrusted)})
 const cdp=await page.context().newCDPSession(page),ui=nativeUserInput({send:(method,args)=>cdp.send(method,args),evaluate:expression=>page.evaluate(expression)},{timeoutMs:500,pollMs:10})
 await ui.tabTo('#reload');assert.equal(await page.evaluate(()=>document.activeElement.id),'reload');assert.ok(await page.evaluate(()=>keys.length>100&&keys.every(e=>e.trusted)));await ui.key('Enter','Enter',13);assert.equal(await page.evaluate(()=>clicked),true);checks.push({id:'trusted-keyboard-reaches-real-control-after-240-preceding-tab-stops',status:'passed'})
 await assert.rejects(ui.tabTo('#unreachable'),/keyboard target/);await assert.rejects(ui.tabTo('#missing'),/keyboard target/);checks.push({id:'missing-and-explicitly-unreachable-controls-remain-failures',status:'passed'})
 await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/report.json',JSON.stringify({nativeBridgeMocked:false,installedProductProof:false,fixtureOnly:true,precedingTabStops:240,checks},null,2)+'\n');console.log(JSON.stringify({checks:checks.length}))
}finally{await browser.close()}
