import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { renderMobileDesignComparison } from './mobile-design-comparison.mjs'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root=process.env.LONGEDIT_LIBRARY_ROOT_REVIEW_OUTPUT||'docs/evidence/mobile-library-root-2026-10-27',source='docs/design/mobile-library-root-v1/index.html',screens=['all','recent','folder'],sha=b=>createHash('sha256').update(b).digest('hex')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 if(process.argv.includes('--design-only')){
  const output=path.join(root,'design');await mkdir(output,{recursive:true});try{await readFile(output+'/capture.json');throw Error('Reference already captured; use a new output folder.')}catch(e){if(e.code!=='ENOENT')throw e}
  const page=await browser.newPage({viewport:{width:1000,height:920}}),capture={capturedAt:new Date().toISOString(),source,sourceSha256:sha(await readFile(source)),screens:[]}
  for(const screen of screens){await page.goto(pathToFileURL(path.resolve(source)).href+'?screen='+screen);const file=path.join(output,screen+'.png');await page.locator('#phone').screenshot({path:file});capture.screens.push({screen,width:390,height:844,sha256:sha(await readFile(file))})}
  await writeFile(output+'/capture.json',JSON.stringify(capture,null,2)+'\n');console.log(JSON.stringify(capture))
 }else{
  const capture=JSON.parse(await readFile(root+'/design/capture.json','utf8'));if(capture.sourceSha256!==sha(await readFile(source)))throw Error('Reference source changed')
  const actual=JSON.parse(await readFile(root+'/final/report.json','utf8')),alignment=[]
  for(const screen of screens){const reference=path.join(root,'design',screen+'.png');if(capture.screens.find(s=>s.screen===screen).sha256!==sha(await readFile(reference)))throw Error('Reference image changed');const output=path.join(root,'comparison-'+screen);await mkdir(output,{recursive:true});await renderMobileDesignComparison(browser,output,{reference,actual:'../final/'+screen+'.png',referenceLabel:'实现前设计 · 390 × 844',actualLabel:'生产构建 · 真实点按',title:'Long编辑 · 资料入口 · '+screen,description:'核对当前库、全部/最近、同名文件路径与三项根导航。',footer:'实际截图只裁去浏览器调试横条，未隐藏产品控件或改写图像。对照64px根页栏、16px边距、48px分段/查找和三项导航；具体文件时间与状态以实际来源为准。'})}
  const page=await browser.newPage({viewport:{width:1000,height:920}})
  try{for(const screen of screens){await page.goto(pathToFileURL(path.resolve(source)).href+'?screen='+screen);const design=await page.evaluate(()=>{const phone=document.querySelector('#phone').getBoundingClientRect(),box=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x-phone.x,y:r.y-phone.y,width:r.width,height:r.height}:null};return{header:box('.header'),title:box('.heading h1'),library:box('.library'),modes:box('.modes'),search:box('.search'),continue:box('.continue'),navigation:box('.nav'),add:box('.fab')}}),real=actual.geometry[screen],differences=[];for(const key of Object.keys(design)){if(design[key]===null&&real[key]===null)continue;for(const metric of ['x','y','width','height'])if(Math.abs(design[key][metric]-real[key][metric])>.5)differences.push({key,metric,design:design[key][metric],actual:real[key][metric]})};alignment.push({screen,design,actual:real,differences,remaining:'Real file ordering is folders then names; the root Recent location replaces duplicate filename text, and the returned folder row keeps focus highlighting. Existing SVG glyphs are preserved.'});if(differences.length)throw Error('Root page geometry changed: '+JSON.stringify(differences))}}finally{await page.close()}
  await writeFile(root+'/alignment.json',JSON.stringify(alignment,null,2)+'\n')
  console.log(JSON.stringify({root,comparisons:3}))
 }
}finally{await browser.close()}
