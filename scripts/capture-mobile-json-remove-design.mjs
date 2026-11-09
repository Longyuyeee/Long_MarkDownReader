import {createRequire} from 'node:module'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output='docs/evidence/mobile-json-remove-2026-10-27',screens=['container','scalar','array','duplicate','error']
await mkdir(output,{recursive:true})
try{await access(output+'/design-freeze.json');throw new Error('设计已冻结，禁止覆盖；新设计请使用新版本目录。')}catch(error){if(error.code!=='ENOENT')throw error}
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:438,height:892},deviceScaleFactor:1}),capture={frozenAt:new Date().toISOString(),runtimeHead:'664948bbc',viewport:{width:390,height:844},files:{},geometry:{},typography:{}}
 for(const screen of screens){await page.goto('http://127.0.0.1:9025/mobile-json-remove-v1/index.html?screen='+screen);await page.locator('.phone').screenshot({path:output+'/design-'+screen+'.png'});capture.geometry[screen]=await page.evaluate(()=>{const origin=document.querySelector('.phone').getBoundingClientRect(),box=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height}:null};return{header:box('.header'),title:box('.header h1'),body:box('.body'),context:box('.context'),impact:box('.impact'),duplicate:box('.duplicate'),card:box('.card'),error:box('.error'),footer:box('.footer')}});capture.typography[screen]=await page.evaluate(()=>Object.fromEntries(Object.entries({title:'.header h1',file:'.file',path:'.path',impact:'.impact',duplicate:'.duplicate',cardTitle:'.card h2',value:'.card pre',action:'.footer .button',error:'.error'}).map(([key,selector])=>{const e=document.querySelector(selector);if(!e)return[key,null];const s=getComputedStyle(e);return[key,Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color'].map(p=>[p,s[p]]))]})))}
 for(const file of ['docs/design/mobile-json-remove-v1/index.html',...screens.map(s=>output+'/design-'+s+'.png')])capture.files[file]=createHash('sha256').update(await readFile(file)).digest('hex')
 await writeFile(output+'/design-freeze.json',JSON.stringify(capture,null,2)+'\n');console.log(JSON.stringify({frozenAt:capture.frozenAt,files:capture.files},null,2))
}finally{await browser.close()}
