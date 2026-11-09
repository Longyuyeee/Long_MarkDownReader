import {createRequire} from 'node:module'
import {readFile,writeFile,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output='docs/evidence/mobile-json-value-2026-10-27',screens=['list','field','edit','review','error']
try{await access(output+'/design-freeze.json');throw new Error('设计已冻结；禁止覆盖。请为新设计创建新的版本目录。')}catch(error){if(error.code!=='ENOENT')throw error}
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:438,height:892},deviceScaleFactor:1}),capture={frozenAt:new Date().toISOString(),runtimeHead:'fad535d32',viewport:{width:390,height:844},files:{},geometry:{}}
 for(const screen of screens){await page.goto((process.env.LONGEDIT_JSON_DESIGN_URL||'http://127.0.0.1:9025/mobile-json-value-v1/index.html')+'?screen='+screen);await page.locator('.phone').screenshot({path:output+'/design-'+screen+'.png'});capture.geometry[screen]=await page.evaluate(()=>{const origin=document.querySelector('.phone').getBoundingClientRect(),box=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height}:null};return{header:box('.header'),title:box('.header h1'),body:box('.body'),context:box('.context'),filter:box('input.input'),first:box('.field'),card:box('.card'),form:box('.form'),kind:box('select'),input:box('textarea'),footer:box('.footer')}})}
 for(const file of ['docs/design/mobile-json-value-v1/index.html',...screens.map(s=>output+'/design-'+s+'.png')])capture.files[file]=createHash('sha256').update(await readFile(file)).digest('hex')
 await writeFile(output+'/design-freeze.json',JSON.stringify(capture,null,2)+'\n')
}finally{await browser.close()}
