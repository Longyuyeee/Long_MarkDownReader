import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import {renderMobileDesignComparison} from './mobile-design-comparison.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),root='docs/evidence/mobile-search-entry-2026-10-27',source='docs/design/mobile-search-entry-v1/index.html',screens=['empty','results','no-results','scope'],sha=b=>createHash('sha256').update(b).digest('hex')
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 if(process.argv.includes('--design-only')){
  const output=root+'/design';await mkdir(output,{recursive:true});try{await readFile(output+'/capture.json');throw Error('Reference already captured')}catch(e){if(e.code!=='ENOENT')throw e}
  const page=await browser.newPage({viewport:{width:1000,height:920}}),capture={capturedAt:new Date().toISOString(),source,sourceSha256:sha(await readFile(source)),screens:[]}
  for(const screen of screens){await page.goto(pathToFileURL(path.resolve(source)).href+'?screen='+screen);await page.locator('#phone').screenshot({path:output+'/'+screen+'.png'});capture.screens.push({screen,width:390,height:844,sha256:sha(await readFile(output+'/'+screen+'.png'))})}
  await writeFile(output+'/capture.json',JSON.stringify(capture,null,2)+'\n');console.log(JSON.stringify({captured:screens.length,sourceSha256:capture.sourceSha256}))
 }else{
  const capture=JSON.parse(await readFile(root+'/design/capture.json','utf8'));if(capture.sourceSha256!==sha(await readFile(source)))throw Error('Frozen source changed')
  for(const screen of screens){const reference=root+'/design/'+screen+'.png';if(capture.screens.find(s=>s.screen===screen).sha256!==sha(await readFile(reference)))throw Error('Frozen image changed');const output=root+'/comparison-'+screen;await mkdir(output,{recursive:true});await renderMobileDesignComparison(browser,output,{reference,actual:'../final/'+screen+'.png',referenceLabel:'实现前冻结设计 · 390 × 844',actualLabel:'生产构建 · 真实点按',title:'Long编辑 · 搜索 · '+screen,description:'关键词、当前范围与最近入口；范围选项按需展开。',footer:'实际截图只裁去调试横条，未隐藏产品控件或重画原图。文件原文摘录、焦点和数据状态以实际来源为准。'})}
  const actual=JSON.parse(await readFile(root+'/final/report.json','utf8')),alignment=[],page=await browser.newPage({viewport:{width:1000,height:920}})
  try{for(const screen of screens){await page.goto(pathToFileURL(path.resolve(source)).href+'?screen='+screen);const reference=await page.evaluate(()=>{const phone=document.querySelector('#phone').getBoundingClientRect(),box=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x-phone.x,y:r.y-phone.y,width:r.width,height:r.height}:null};return{header:box('.header'),title:box('.heading h1'),search:box('.search'),scope:box('.scope-summary'),navigation:box('.nav'),sheet:box('.sheet'),firstRecent:box('.row'),scopeLibrary:box('.sheet .library'),emptyTitle:box('.blank h3'),emptyAction:box('.blank button'),firstResult:box('.result')}}),real=actual.geometry[screen],differences=[];for(const key of Object.keys(reference)){if(reference[key]===null&&real[key]===null)continue;if(!reference[key]||!real[key]){differences.push({key,reference:reference[key],actual:real[key]});continue}for(const metric of ['x','y','width','height'])if(Math.abs(reference[key][metric]-real[key][metric])>.5)differences.push({key,metric,reference:reference[key][metric],actual:real[key][metric]})}alignment.push({screen,reference,actual:real,differences})}}finally{await page.close()}
  await writeFile(root+'/alignment.json',JSON.stringify({toleranceCssPx:.5,screens:alignment,remaining:'Real source excerpts and focused controls retain their actual data and outline; existing SVG glyphs and font weights are preserved.'},null,2)+'\n')
  const core=alignment.flatMap(s=>s.differences.filter(d=>!['firstResult'].includes(d.key)));if(core.length)throw Error('Search geometry differs: '+JSON.stringify(core))
  console.log(JSON.stringify({comparisons:screens.length,coreGeometryDifferences:core.length}))
 }
}finally{await browser.close()}
