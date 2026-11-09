import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {textV3Name,textV3Source,longTextV3Name,longTextV3Source} from './fixtures/mobile-text-v3.mjs'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),stage=process.argv[2];assert.match(stage||'',/^[a-z0-9-]+$/)
const nested=process.argv.includes('--nested')
const variants=nested?[[390,872,16,false],[390,872,16,true],[320,502,32,false]]:stage==='baseline'?[[390,844,16,false]]:[[390,844,16,false],[360,800,16,false],[320,640,16,false],[390,844,16,true],[390,844,21,false],[320,640,32,false]]
const root='docs/evidence/mobile-0.1.0/text-v3-2026-11-05',out=root+'/'+stage;await mkdir(root,{recursive:true});await writeFile(root+'/.gitignore','*\n!.gitignore\n');await assert.rejects(access(out));await mkdir(out)
const report={stage,scope:'Full original production UI with synthetic text. Browser font defaults approximate whole-page scaling, not native IME/textZoom. No source/CSS replaced after render.',sources:[],screens:[]};let browser
try{
 for(const file of ['src/mobile/MobileApp.vue','src/mobile/MobileReader.vue','src/mobile/readerDocument.ts','src/mobile/plainTextPresentation.ts','src/mobile/SourceReader.vue','src/mobile/SourcePager.vue','src/mobile/MobileSourcePageDialog.vue','src/mobile/mobile.scss'])report.sources.push({file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')})
 for(const[width,height,font,dark]of variants){
  browser=await chromium.launch({channel:'chrome',headless:true,args:[`--blink-settings=defaultFontSize=${font},defaultFixedFontSize=${font}`]});const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await context.addInitScript(({rain,long,dark})=>{if(window!==top)return;const documents=Object.fromEntries([rain,long].map(([relativePath,content])=>[JSON.stringify(['local',relativePath]),{rootId:'local',relativePath,content,signature:'fixture-'+relativePath,modified:1}]));localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify({version:1,documents,drafts:{}}));localStorage.setItem('longedit-mobile-preferences-v1',JSON.stringify({version:1,theme:dark?'dark':'light'}))},{rain:[textV3Name,textV3Source],long:[longTextV3Name,longTextV3Source],dark});const page=await context.newPage();await page.goto('http://127.0.0.1:9012/mobile.html')
  for(const name of [textV3Name,longTextV3Name]){
   await page.locator('.file-row').filter({has:page.getByText(name,{exact:true})}).tap();if(name===textV3Name){await page.frameLocator('iframe.mobile-reader').locator('pre').waitFor();await page.waitForTimeout(180)}else await page.locator('.source-fragment').first().waitFor()
   const variant=`${width}-${dark?'dark':'light'}-${font}`,kind=name===textV3Name?'short':'long';await page.screenshot({path:`${out}/${kind}-${variant}.png`});report.screens.push({kind,variant,viewport:{width,height},font,dark,geometry:await page.evaluate(()=>{const b=s=>document.querySelector(s)?.getBoundingClientRect().toJSON()||null;return{header:b('.reader-header'),frame:b('iframe.mobile-reader'),source:b('.source-page-content'),pager:b('.source-pager'),footer:b('.editor-footer'),overflow:document.documentElement.scrollWidth>innerWidth}})})
   if(kind==='long'){
    await page.getByRole('button',{name:/第 .* 段，前往段落/}).tap()
    const input=page.locator('#source-page-number')
    await input.waitFor()
    if(nested)await input.fill('12')
    await page.screenshot({path:`${out}/jump-${variant}.png`})
    report.screens.push({kind:'jump',variant,geometry:await page.locator('.source-page-dialog').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),input:e.querySelector('input').getBoundingClientRect().toJSON(),text:e.innerText}))})
    if(nested){
     const help=page.getByRole('button',{name:'分段阅读说明',exact:true})
     await help.tap()
     await page.locator('.mobile-help-dialog').waitFor()
     await page.waitForTimeout(350)
     await page.screenshot({path:`${out}/help-${variant}.png`})
     report.screens.push({kind:'help',variant,parentVisible:await page.locator('.source-page-layer').isVisible()})
     await page.evaluate(()=>window.__longeditMobileBack())
     await input.waitFor()
     assert.equal(await input.inputValue(),'12')
     assert.equal(await help.evaluate(element=>element===document.activeElement),true)
    }
    await page.evaluate(()=>window.__longeditMobileBack())
    await page.getByRole('dialog').waitFor({state:'hidden'})
   }
   await page.evaluate(()=>window.__longeditMobileBack());await page.locator('.file-row').first().waitFor()
  }
  await browser.close();browser=undefined
 }
 report.passed=true
}catch(error){report.failure=String(error.stack||error);throw error}finally{await browser?.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify({out,passed:report.passed,screens:report.screens.length,first:report.screens[0]}))
