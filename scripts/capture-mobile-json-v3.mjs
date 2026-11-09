import assert from 'node:assert/strict'
import {mkdir,writeFile,readFile,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {openJsonAction} from './mobile-json-navigation.mjs'
import {jsonV3Name,jsonV3Source} from './fixtures/mobile-json-v3.mjs'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),stage=process.argv[2];assert.match(stage||'',/^[a-z0-9-]+$/)
const verify=process.argv.includes('--verify')
const root='docs/evidence/mobile-0.1.0/json-v3-2026-11-06',out=root+'/'+stage;await mkdir(root,{recursive:true});await writeFile(root+'/.gitignore','*\n!.gitignore\n');await assert.rejects(access(out));await mkdir(out)
const report={stage,scope:'Full production UI and isolated synthetic preview data. No cropped screenshots or product CSS injection. Browser windows/default-font changes do not replace Android IME/textZoom.',sources:[],screens:[],passed:false};let browser
try{
for(const f of ['src/mobile/JsonStructure.vue','src/mobile/JsonOperations.vue','src/mobile/JsonTools.vue','src/mobile/MobileApp.vue','src/mobile/JsonFieldRows.vue','src/mobile/jsonTree.ts','src/mobile/mobileHelp.ts'])report.sources.push({file:f,sha256:createHash('sha256').update(await readFile(f)).digest('hex')})
for(const[w,h,font,dark]of stage==='baseline'?[[390,844,16,false]]:[[390,844,16,false],[360,800,16,false],[320,640,16,false],[390,844,16,true],[390,844,21,false],[320,640,32,false],[390,502,16,false],[320,502,32,false],[320,340,32,false]]){
 browser=await chromium.launch({channel:'chrome',headless:true,args:[`--blink-settings=defaultFontSize=${font},defaultFixedFontSize=${font}`]});const ctx=await browser.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await ctx.addInitScript(({name,content,dark})=>{if(window!==top)return;localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify({version:1,documents:{[JSON.stringify(['local',name])]:{rootId:'local',relativePath:name,content,signature:'json-v3-fixture',modified:1}},drafts:{}}));localStorage.setItem('longedit-mobile-preferences-v1',JSON.stringify({version:1,theme:dark?'dark':'light'}))},{name:jsonV3Name,content:jsonV3Source,dark});const p=await ctx.newPage(),button=n=>p.getByRole('button',{name:n,exact:true});await p.goto('http://127.0.0.1:9012/mobile.html');await p.locator('.file-row').filter({has:p.getByText(jsonV3Name,{exact:true})}).tap();if(stage==='baseline'){await button('编辑').tap();await button('浏览结构').tap()}else await openJsonAction(p,'浏览结构');await p.locator('.json-field').first().waitFor()
 const variant=`${w}x${h}-${dark?'dark':'light'}-${font}`;async function shot(name){await p.screenshot({path:out+'/'+name+'-'+variant+'.png'});report.screens.push({name,variant,geometry:await p.evaluate(()=>{const b=s=>document.querySelector(s)?.getBoundingClientRect().toJSON()||null;return{background:getComputedStyle(document.querySelector('.json-structure')).backgroundColor,header:b('.json-task-header'),body:b('.json-task-body'),footer:b('.json-task-footer'),card:b('.json-value-card'),title:b('.json-task-header h1'),titleContentHeight:document.querySelector('.json-task-header h1').scrollHeight,type:b('.json-type-badge'),value:b('.json-value-content pre'),input:b('#json-value'),error:b('#json-value-error'),overflow:document.documentElement.scrollWidth>innerWidth}})})}
 await shot('tree');if(stage==='baseline'){await p.locator('.json-field').filter({hasText:'app'}).first().tap();await p.locator('.json-field').filter({hasText:'fontSize'}).tap()}else await p.locator('.json-field').filter({hasText:'fontSize'}).first().tap();await shot('detail');await button(stage==='baseline'?'修改这个值':'修改').tap();await shot('edit');if(stage!=='baseline'&&w===390&&h===844&&font===16&&!dark){await p.locator('#json-value').fill('18');await button('核对修改').tap();await shot('review')}
 if(w===320&&h<=502&&font===32){
  await p.locator('#json-value').fill('01')
  await button('核对修改').tap()
  await p.locator('#json-value-error').waitFor()
  await p.waitForTimeout(250)
  await shot('error')
  if(verify){
   const geometry=name=>report.screens.find(s=>s.name===name&&s.variant===variant).geometry
   const tree=geometry('tree'),detail=geometry('detail'),invalid=geometry('error')
   assert.ok(tree.titleContentHeight<=tree.title.height+1,'The full fixture filename fits')
   assert.ok(Math.abs(detail.type.x-detail.value.x)<1,'The type and value share an alignment')
   assert.ok(invalid.input.top>=invalid.body.top-1&&invalid.input.bottom<=invalid.body.bottom+1,'The invalid input remains visible')
   if(h===502)assert.ok(invalid.error.bottom<=invalid.body.bottom+1,'The complete error is visible when space permits')
  }
 }
 await browser.close();browser=undefined
}report.passed=true
}finally{await browser?.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2))}console.log(JSON.stringify({passed:report.passed,screens:report.screens.length,out}))
