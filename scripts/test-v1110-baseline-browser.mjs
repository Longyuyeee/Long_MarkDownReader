// Historical baseline: documents the actual pre-change Vue failure. Simulated
// IPC is explicitly not native or installed acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1110-baseline',url=process.env.LONGEDIT_V1110_URL||'http://127.0.0.1:9020'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[]
page.on('pageerror',error=>errors.push(error.message))
try{
 await page.goto(url+'/scripts/fixtures/workflow-redesign-browser.html')
 await page.getByRole('link',{name:'资料库',exact:true}).click();await page.locator('#tab-collections').click()
 const panel=page.getByRole('region',{name:'智能集合条件'})
 await panel.getByRole('button',{name:'最近更新',exact:true}).click();await panel.locator('.collection-result').waitFor()
 const before=await panel.locator('.collection-result').count();await page.screenshot({path:output+'/collection-before.png',fullPage:true})
 await page.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=(command,args)=>command==='search_smart_collection'?new Promise((resolve,reject)=>{window.baselineReject=()=>reject(Error('合成断网：刷新未完成'))}):original(command,args)})
 await panel.getByRole('button',{name:'刷新',exact:true}).click();await panel.locator('.result-waiting').waitFor()
 const during=await panel.locator('.collection-result').count();await page.screenshot({path:output+'/collection-refresh-cleared.png',fullPage:true})
 await page.evaluate(()=>window.baselineReject());await panel.getByRole('alert').waitFor();const afterFailure=await panel.locator('.collection-result').count()
 await page.screenshot({path:output+'/collection-failed-cleared.png',fullPage:true})
 assert.equal(before,1);assert.equal(during,0);assert.equal(afterFailure,0);assert.deepEqual(errors,[])
 await fs.writeFile(output+'/report.json',JSON.stringify({scope:'pre-change Vue baseline with simulated IPC; not native acceptance',productBase:'2b3062fcac3c02bb151a7135ac3dfd9c0c3a8483',observed:{before,during,afterFailure},defect:'Refresh discards the existing file cards before a replacement succeeds',errors},null,2)+'\n')
 console.log(JSON.stringify({before,during,afterFailure,errors:errors.length}))
}finally{await browser.close()}
