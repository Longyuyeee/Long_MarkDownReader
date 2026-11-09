import {createRequire} from 'node:module'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output='docs/evidence/mobile-pdf-annotation-editor-2026-10-28',screens=['new-comment','new-highlight','edit','color','quote','discard','invalid']
await mkdir(output,{recursive:true});try{await access(output+'/design-freeze-v1.json');throw Error('设计已冻结，禁止覆盖；新设计请用新版本目录。')}catch(e){if(e.code!=='ENOENT')throw e}
const browser=await chromium.launch({channel:'chrome',headless:true})
try{const page=await browser.newPage({viewport:{width:438,height:892},deviceScaleFactor:1}),capture={frozenAt:new Date().toISOString(),runtimeHead:'821c71606',viewport:{width:390,height:844},files:{},geometry:{},typography:{}}
for(const screen of screens){await page.goto('http://127.0.0.1:9027/mobile-pdf-annotation-editor-v1/index.html?screen='+screen);await page.locator('.phone').screenshot({path:output+'/design-v1-'+screen+'.png'});capture.geometry[screen]=await page.evaluate(()=>Object.fromEntries(['.pdf-annotation-editor','.annotation-editor-header','.annotation-editor-context','.annotation-editor-body','.annotation-source-row','.annotation-color-row','#pdf-comment','.annotation-editor-footer','.annotation-editor-layer','.annotation-editor-dialog','.annotation-editor-dialog-header','.annotation-editor-dialog-body','.annotation-editor-dialog-footer'].map(s=>{const r=document.querySelector(s)?.getBoundingClientRect();return[s,r?{x:r.x-24,y:r.y-24,width:r.width,height:r.height}:null]})))}
for(const file of ['docs/design/mobile-pdf-annotation-editor-v1/index.html',...screens.map(s=>output+'/design-v1-'+s+'.png')])capture.files[file]=createHash('sha256').update(await readFile(file)).digest('hex')
await writeFile(output+'/design-freeze-v1.json',JSON.stringify(capture,null,2)+'\n');console.log(JSON.stringify({frozenAt:capture.frozenAt,sourceSha256:capture.files['docs/design/mobile-pdf-annotation-editor-v1/index.html'],screens:screens.length},null,2))
}finally{await browser.close()}
