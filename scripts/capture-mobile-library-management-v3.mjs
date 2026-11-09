import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {seed,open,back,sha} from './fixtures/mobile-library-management-v3.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),stage=process.argv[2],root='docs/evidence/mobile-0.1.0/library-management-v3-2026-11-07',out=root+'/'+stage
assert.match(stage||'',/^[a-z0-9-]+$/);await mkdir(root,{recursive:true});await writeFile(root+'/.gitignore','*\n!.gitignore\n');await assert.rejects(access(out));await mkdir(out)
const report={passed:false,stage,scope:'Full unaltered production touch-browser views; browser default font launch setting, no product CSS injection. Before captures use the existing f35a10e90 dist, not changed working source. Not native Android acceptance.',sources:[],screens:[],errors:[]};let browser,page
try{for(const file of ['src/mobile/MobileApp.vue','src/mobile/MobileSettings.vue','src/mobile/LibraryRoots.vue','src/mobile/mobileHelp.ts','src/mobile/mobile.scss']){const bytes=stage==='before'?spawnSync('git',['show','HEAD:'+file],{maxBuffer:2*1024*1024}).stdout:await readFile(file);report.sources.push({file,sha256:sha(bytes),gitBefore:stage==='before'})}
for(const[w,h,font,dark]of(stage.startsWith('final')?[[390,844,16,false],[360,800,16,false],[320,640,16,false],[390,844,16,true],[320,640,32,false],[390,502,16,false]]:[[390,844,16,false]])){
 browser=await chromium.launch({channel:'chrome',headless:true,args:[`--blink-settings=defaultFontSize=${font},defaultFixedFontSize=${font}`]});const context=await browser.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await seed(context,{dark});page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));const variant=`${w}x${h}-${dark?'dark':'light'}-${font}`
 async function shot(name){await page.waitForTimeout(160);const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('.settings-detail button,.bottom-sheet button')].filter(e=>e.checkVisibility()&&!e.closest('[inert]')).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),rect:e.getBoundingClientRect().toJSON()}))}));assert.equal(geometry.overflow,false);await page.screenshot({path:`${out}/${name}-${variant}.png`});report.screens.push({name,variant,...geometry})}
 await open(page);await shot('storage')
 if(stage==='before'){await page.getByRole('button',{name:'停止访问 Documents',exact:true}).tap();await shot('confirmation');await back(page)}
 else{await page.locator('[data-focus-key="library-more-outside"]').tap();await shot('actions');await page.locator('[data-focus-key="library-disconnect-entry"]').tap();await shot('confirmation');await back(page);await back(page);await page.getByRole('button',{name:'文件夹授权说明',exact:true}).tap();await shot('help');await back(page)}
 await back(page);await page.getByRole('button',{name:'资料',exact:true}).tap();await page.locator('.library-selector').tap();await shot('picker');await back(page)
 if(stage!=='before'&&w===390&&h===844&&!dark){await page.getByRole('button',{name:'设置',exact:true}).tap();await page.locator('[data-focus-key="settings-storage"]').tap();await shot('reentered');await back(page);await shot('settings')}
 await context.close();await browser.close();browser=null
}assert.deepEqual(report.errors,[]);report.passed=true
}catch(e){report.failure=String(e.stack||e);await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1}finally{await browser?.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2))}console.log(JSON.stringify({stage,passed:report.passed,screens:report.screens.length,failure:report.failure}))
