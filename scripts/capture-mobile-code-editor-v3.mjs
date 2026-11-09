import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {codeEditorV3Name,codeEditorV3Source} from './fixtures/mobile-code-editor-v3.mjs'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),stage=process.argv[2];assert.match(stage||'',/^[a-z0-9-]+$/)
const root='docs/evidence/mobile-0.1.0/code-editor-v3-2026-11-05',out=root+'/'+stage;await mkdir(root,{recursive:true});await writeFile(root+'/.gitignore','*\n!.gitignore\n');await assert.rejects(access(out));await mkdir(out)
const report={stage,scope:'Full production browser UI with synthetic data. Short browser window approximates available space, not Android IME; font defaults do not replace textZoom. No pixel alteration or CSS injection.',sources:[],screens:[],passed:false};let browser
try{
 for(const file of ['src/mobile/MobileApp.vue','src/mobile/MobileEditor.vue','src/mobile/CodeTouchTools.vue','src/mobile/mobile.scss','src/mobile/codeCommands.ts','src/mobile/codeLineActions.ts','src/mobile/codeLanguage.ts','src/mobile/mobileHelp.ts'])report.sources.push({file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')})
 for(const[width,height,font,dark]of stage==='baseline'?[[390,502,16,false]]:[[390,502,16,false],[390,844,16,false],[360,500,16,false],[320,500,16,false],[390,502,16,true],[390,502,21,false],[320,502,32,false],[568,240,16,false]]){
  browser=await chromium.launch({channel:'chrome',headless:true,args:[`--blink-settings=defaultFontSize=${font},defaultFixedFontSize=${font}`]});const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await context.addInitScript(({name,content,dark})=>{if(window!==top)return;localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify({version:1,documents:{[JSON.stringify(['local',name])]:{rootId:'local',relativePath:name,content,signature:'fixture-editor-v3',modified:1}},drafts:{}}));localStorage.setItem('longedit-mobile-preferences-v1',JSON.stringify({version:1,theme:dark?'dark':'light'}))},{name:codeEditorV3Name,content:codeEditorV3Source,dark});const page=await context.newPage();await page.goto('http://127.0.0.1:9012/mobile.html');await page.locator('.file-row').filter({has:page.getByText(codeEditorV3Name,{exact:true})}).tap();await page.frameLocator('iframe.mobile-reader').locator('pre').waitFor();await page.getByRole('button',{name:'编辑',exact:true}).tap();const body=page.getByRole('textbox',{name:'笔记正文',exact:true});await body.press('Control+End');await page.waitForTimeout(250)
  const variant=`${width}x${height}-${dark?'dark':'light'}-${font}`;async function shot(kind){await page.screenshot({path:`${out}/${kind}-${variant}.png`});report.screens.push({kind,variant,geometry:await page.evaluate(()=>{const b=s=>document.querySelector(s)?.getBoundingClientRect().toJSON()||null;return{header:b('.reader-header'),body:b('.document-body'),tools:b('.code-touch-tools'),content:b('.cm-content'),sheet:b('.bottom-sheet'),overflow:document.documentElement.scrollWidth>innerWidth}})})}
  await shot('editor');if(stage!=='baseline'&&width===390&&height===502&&font===16&&!dark){await page.getByRole('button',{name:/切换编辑工具/}).tap();await shot('picker')}
  await browser.close();browser=undefined
 }
 report.passed=true
}finally{await browser?.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify({out,passed:report.passed,screens:report.screens.length}))
