import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {codeV3Name,codeV3Source} from './fixtures/mobile-code-v3.mjs'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),stage=process.argv[2];assert.match(stage||'',/^[a-z0-9-]+$/)
const nested=process.argv.includes('--nested')
const variants=nested?[[390,872,16,false],[390,872,16,true],[320,502,32,false]]:stage==='baseline'?[[390,844,16,false]]:[[390,844,16,false],[360,800,16,false],[320,640,16,false],[390,844,16,true],[390,844,21,false],[320,640,32,false]]
const root='docs/evidence/mobile-0.1.0/code-reading-v3-2026-11-05',out=root+'/'+stage;await mkdir(root,{recursive:true});await writeFile(root+'/.gitignore','*\n!.gitignore\n');await assert.rejects(access(out));await mkdir(out)
const report={stage,scope:'Full production browser screenshots, isolated synthetic preview data, no CSS injection or pixel alteration. Browser font defaults do not replace native font/IME checks.',sources:[],screens:[],passed:false};let browser
try{
 for(const file of ['src/mobile/MobileApp.vue','src/mobile/MobileReader.vue','src/mobile/readerDocument.ts','src/mobile/readerBridge.js','src/mobile/reader.worker.ts','src/mobile/codePresentation.ts','src/mobile/SourceReader.vue','src/mobile/mobile.scss','src/mobile/CodeTools.vue','src/mobile/mobileHelp.ts','src/mobile/readerPreparation.ts','src/mobile/storage.ts','src-tauri/tauri.android.conf.json','src-tauri/plugins/mobile-storage/android/src/main/java/StoragePlugin.kt','src/mobile/codeLanguage.ts','src/mobile/markdownCode.ts']){try{report.sources.push({file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')})}catch(error){if(stage!=='baseline')throw error}}
 for(const[width,height,font,dark]of variants){
  browser=await chromium.launch({channel:'chrome',headless:true,args:[`--blink-settings=defaultFontSize=${font},defaultFixedFontSize=${font}`]});const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await context.addInitScript(({name,content,dark})=>{if(window!==top)return;localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify({version:1,documents:{[JSON.stringify(['local',name])]:{rootId:'local',relativePath:name,content,signature:'fixture-code-v3',modified:1}},drafts:{}}));localStorage.setItem('longedit-mobile-preferences-v1',JSON.stringify({version:1,theme:dark?'dark':'light'}))},{name:codeV3Name,content:codeV3Source,dark});const page=await context.newPage();await page.goto('http://127.0.0.1:9012/mobile.html');await page.locator('.file-row').filter({has:page.getByText(codeV3Name,{exact:true})}).tap();await page.frameLocator('iframe.mobile-reader').locator('pre').waitFor();await page.waitForTimeout(300)
  const variant=`${width}-${dark?'dark':'light'}-${font}`;async function shot(kind){await page.screenshot({path:`${out}/${kind}-${variant}.png`});report.screens.push({kind,variant,geometry:await page.evaluate(()=>{const b=s=>document.querySelector(s)?.getBoundingClientRect().toJSON()||null;return{header:b('.reader-header'),body:b('.document-body'),footer:b('.editor-footer'),sheet:b('.bottom-sheet'),overflow:document.documentElement.scrollWidth>innerWidth}})})}
  async function captureHelp(kind){
   const trigger=page.locator('.bottom-sheet').getByRole('button',{name:'源码说明',exact:true})
   await trigger.tap()
   const help=page.locator('.mobile-help-dialog')
   await help.waitFor()
   await page.waitForTimeout(350)
   await shot(kind)
   report.screens.at(-1).parentVisible=await page.locator('.sheet-backdrop').isVisible()
   await page.evaluate(()=>window.__longeditMobileBack())
   await help.waitFor({state:'hidden'})
   assert.equal(await trigger.evaluate(element=>element===document.activeElement),true)
  }
  await shot('reading')
  await page.getByRole('button',{name:'文档操作',exact:true}).tap()
  await shot('menu')
  if(nested)await captureHelp('menu-help')
  if(stage!=='baseline'){
   await page.getByRole('button',{name:'定位行',exact:true}).tap()
   const line=page.locator('#code-line-number')
   await line.waitFor()
   if(nested)await line.fill('14')
   await shot('line')
   if(nested){
    await captureHelp('line-help')
    assert.equal(await line.inputValue(),'14')
   }
  }
  await browser.close();browser=undefined
 }
 report.passed=true
}finally{await browser?.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify({out,passed:report.passed,screens:report.screens.length}))
