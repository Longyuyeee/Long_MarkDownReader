import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import {renderMobileDesignComparison} from './mobile-design-comparison.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),root='docs/evidence/mobile-reading-entry-2026-10-27',source='docs/design/mobile-reading-entry-v1/index.html',screens=['reading','editing','menu','find'],sha=b=>createHash('sha256').update(b).digest('hex')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 if(process.argv.includes('--design-only')){
  const output=root+'/design';await mkdir(output,{recursive:true});try{await readFile(output+'/capture.json');throw Error('Frozen reference already exists')}catch(e){if(e.code!=='ENOENT')throw e}
  const page=await browser.newPage({viewport:{width:1000,height:920}}),capture={capturedAt:new Date().toISOString(),source,sourceSha256:sha(await readFile(source)),screens:[]}
  for(const screen of screens){await page.goto(pathToFileURL(path.resolve(source)).href+'?screen='+screen);await page.locator('#phone').screenshot({path:output+'/'+screen+'.png'});capture.screens.push({screen,width:390,height:844,sha256:sha(await readFile(output+'/'+screen+'.png'))})}
  await writeFile(output+'/capture.json',JSON.stringify(capture,null,2)+'\n');console.log(JSON.stringify(capture))
 }else{
  const capture=JSON.parse(await readFile(root+'/design/capture.json','utf8'));if(capture.sourceSha256!==sha(await readFile(source)))throw Error('Frozen source changed')
  const actual=JSON.parse(await readFile(root+'/final/report.json','utf8')),alignment=[],page=await browser.newPage({viewport:{width:1000,height:920}})
  for(const screen of screens){const reference=root+'/design/'+screen+'.png';if(capture.screens.find(s=>s.screen===screen).sha256!==sha(await readFile(reference)))throw Error('Frozen image changed');await page.goto(pathToFileURL(path.resolve(source)).href+'?screen='+screen);const geometry=await page.evaluate(()=>{const p=document.querySelector('#phone').getBoundingClientRect(),box=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x-p.x,y:r.y-p.y,width:r.width,height:r.height}:null};return{header:box('.header'),title:box('.heading h1'),footer:box('.footer'),sheet:box('.sheet'),search:box('.find')}});const real=actual.geometry[screen],differences=[];for(const k of Object.keys(geometry)){if(!geometry[k]&&!real[k])continue;for(const m of ['x','y','width','height'])if(!geometry[k]||!real[k]||Math.abs(geometry[k][m]-real[k][m])>.5)differences.push({key:k,metric:m,reference:geometry[k]?.[m],actual:real[k]?.[m]})}alignment.push({screen,reference:geometry,actual:real,differences});const output=root+'/comparison-'+screen;await mkdir(output,{recursive:true});await renderMobileDesignComparison(browser,output,{reference,actual:'../final/'+screen+'.png',referenceLabel:'实现前冻结设计 · 390 × 844',actualLabel:'生产构建 · 真实操作',title:'Long编辑 · 阅读与编辑 · '+screen,description:'阅读留给正文；查找、收件和次要操作按需打开。',footer:'仅裁去浏览器预览横条。保留实际字体、工具图标、选区、搜索高亮和编辑内容；不会移动原截图以消除差异。底部弹层以完整浏览器视口定位，已单列裁图的坐标影响。'})}
  await writeFile(root+'/alignment.json',JSON.stringify({toleranceCssPx:.5,screens:alignment},null,2)+'\n');console.log(JSON.stringify(alignment.map(s=>({screen:s.screen,differences:s.differences}))))
 }
}finally{await browser.close()}
