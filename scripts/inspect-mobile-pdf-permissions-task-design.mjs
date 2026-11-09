import {createRequire} from 'node:module'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const output='docs/evidence/mobile-pdf-permissions-task-2026-10-28',freeze=JSON.parse(await readFile(output+'/design-freeze-v1.json','utf8'))
for(const [file,hash] of Object.entries(freeze.files))if(createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw Error('Frozen reference changed: '+file)
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),result={capturedAt:new Date().toISOString(),reference:'design-freeze-v1.json',typography:{},icons:{}}
try{const page=await browser.newPage({viewport:{width:438,height:892}})
for(const name of Object.keys(freeze.geometry)){
 const short=name==='detail-short-320-200';await page.setViewportSize(short?{width:320,height:273}:{width:438,height:892});await page.goto('http://127.0.0.1:9027/mobile-pdf-permissions-task-v1/index.html?screen='+name)
 if(short)await page.evaluate(()=>{document.documentElement.style.fontSize='32px';Object.assign(document.querySelector('.phone').style,{width:'320px',height:'273px',margin:'0'});const body=document.querySelector('.permissions-dialog-body');body.scrollTop=body.scrollHeight})
 result.typography[name]=await page.evaluate(()=>Object.fromEntries(['.permissions-header h1','.permissions-card strong','.permissions-row strong','.permissions-status','.permissions-dialog h2','.permissions-detail-copy','.permissions-footer .button','.permissions-dialog-footer .button','.pdf-settings-heading h1','.pdf-setting-row strong'].map(s=>{const e=document.querySelector(s);if(!e||!e.checkVisibility())return [s,null];const c=getComputedStyle(e);return [s,Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor'].map(k=>[k,c[k]]))]})))
 result.icons[name]=await page.locator('.permissions-header svg,.permissions-card>svg,.permissions-row>svg,.permissions-dialog-header svg').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>[...e.children].map(n=>({tag:n.tagName,attrs:Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))}))))
}
await writeFile(output+'/design-inspection.json',JSON.stringify(result,null,2)+'\n');console.log('12 frozen reference states inspected without modifying HTML or PNGs')
}finally{await browser.close()}
