import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-file-tree-polish';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:process.env.LONGEDIT_BROWSER_CHANNEL||undefined,headless:true})
const errors=[],checks=[],states=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:820}})
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
 await page.getByRole('link',{name:'资料库',exact:true}).click()
 const tree=page.locator('.library-file-tree'), row=tree.locator('.n-tree-node[data-drop-path="C:/workflow-fixture/会议记录.md"]')
 await row.waitFor()
 const inspect=()=>row.evaluate(el=>{
  const s=getComputedStyle(el),c=el.querySelector('.n-tree-node-content'),cs=getComputedStyle(c),r=el.getBoundingClientRect()
  return {rowBackground:s.backgroundColor,rowShadow:s.boxShadow,text:cs.color,innerBackground:cs.backgroundColor,innerShadow:cs.boxShadow,innerBorder:cs.borderWidth,innerBefore:getComputedStyle(c,'::before').content,rowTransform:s.transform,rect:{x:r.x,y:r.y,width:r.width,height:r.height},selected:el.classList.contains('n-tree-node--selected'),indicator:getComputedStyle(el,'::after').opacity,transition:s.transitionDuration}
 })
 for(const theme of ['white','dark','contrast'])for(const style of ['soft','neo','glass','airy','minimal','sharp']){
  await page.evaluate(({style,theme})=>{
   window.workflowAudit.store.visualStyle=style;window.workflowAudit.store.theme=theme;window.workflowAudit.store.motionSpeed='reduced'
  },{style,theme})
  await page.waitForFunction(({style,theme})=>document.body.dataset.style===style&&document.body.dataset.theme===theme,{style,theme})
  await page.locator('.library-file-tree').getByText('项目方案.md',{exact:true}).click()
  await page.mouse.move(800,500)
  await page.waitForTimeout(30)
  const normal=await inspect()
  await row.locator('.n-tree-node-content').hover();await page.waitForTimeout(30)
  const hovered=await inspect()
  assert.notEqual(hovered.rowBackground,normal.rowBackground,`${theme}/${style}: hover feedback`)
  assert.deepEqual(hovered.rect,normal.rect,`${theme}/${style}: hovering keeps the hit area still`)
  assert.equal(hovered.rowTransform,'none')
  await row.locator('.n-tree-node-content').click();await page.waitForTimeout(30)
  const selected=await inspect()
  assert.equal(selected.selected,true)
  assert.equal(selected.indicator,'1')
  assert.notEqual(selected.rowBackground,hovered.rowBackground,`${theme}/${style}: selected feedback distinct from hover`)
  for(const state of [normal,hovered,selected]){
   assert.equal(state.innerBackground,'rgba(0, 0, 0, 0)',`${theme}/${style}: no second background`)
   assert.equal(state.innerShadow,'none',`${theme}/${style}: no inner shadow`)
   assert.equal(state.innerBorder,'0px',`${theme}/${style}: no inner border`)
   assert.equal(state.innerBefore,'none',`${theme}/${style}: no gradient overlay`)
  }
  states.push({theme,style,normal,hovered,selected})
  if(theme==='white'||(theme==='dark'&&['glass','minimal'].includes(style)))await page.locator('.sidebar').screenshot({path:`${output}/${theme}-${style}.png`,animations:'disabled'})
 }
 checks.push('One row surface across six styles and white/dark/high-contrast themes; hover, selected and idle remain distinct without inner layers or moving hit areas')

 await page.evaluate(()=>{const s=window.workflowAudit.store;s.theme='white';s.visualStyle='soft';s.motionSpeed='calm'})
 await page.locator('.library-file-tree').getByText('项目方案.md',{exact:true}).click()
 await row.hover();await page.waitForTimeout(280)
 await page.locator('.sidebar').screenshot({path:output+'/after-soft-hover.png',animations:'disabled'})
 const animated=await inspect();assert.ok(animated.transition.split(',').some(x=>parseFloat(x)>0.1))
 const icon=await row.locator('.n-tree-node-content__prefix').evaluate(el=>getComputedStyle(el).transform)
 assert.notEqual(icon,'none')
 await page.evaluate(()=>window.workflowAudit.store.motionSpeed='reduced')
 await page.waitForTimeout(30)
 assert.match((await inspect()).transition,/0\.001s/)
 assert.equal(await row.locator('.n-tree-node-content__prefix').evaluate(el=>getComputedStyle(el).transform),'matrix(1, 0, 0, 1, 0, 0)')
 checks.push('Normal motion retains subtle icon response; reduced motion removes lift and scale')

 await page.mouse.move(800,500)
 for(const [density,height]of [['compact',26],['comfortable',34],['spacious',42]]){
  await page.evaluate(density=>window.workflowAudit.store.displayPreferences={...window.workflowAudit.store.displayPreferences,fileDensity:density},density)
  await page.waitForFunction(height=>document.querySelector('.library-file-tree [data-drop-path="C:/workflow-fixture/会议记录.md"]').getBoundingClientRect().height===height,height)
 }
 for(const appearance of ['flat','cards']){
  await page.evaluate(appearance=>window.workflowAudit.store.displayPreferences={...window.workflowAudit.store.displayPreferences,fileRowStyle:appearance},appearance)
  await page.waitForFunction(appearance=>document.body.dataset.fileRowStyle===appearance,appearance)
  await page.waitForTimeout(30)
  const state=await inspect();assert.equal(state.innerShadow,'none');assert.equal(state.innerBackground,'rgba(0, 0, 0, 0)')
  assert.equal(state.rowShadow==='none',appearance==='flat')
 }
 checks.push('User density and flat/card preferences apply to the whole clickable row')
 await page.evaluate(()=>{
  const s=window.workflowAudit.store;s.displayPreferences={...s.displayPreferences,fileDensity:'comfortable',fileRowStyle:'auto'}
  s.fileDisplayStyles={'C:/workflow-fixture/会议记录.md':{backgroundColor:'#173f56',textColor:'#eef8ff',icon:'star'}}
 })
 await page.waitForFunction(()=>document.querySelector('.library-file-tree .has-file-display-style'))
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.library-file-tree .has-file-display-style')).backgroundColor==='rgb(23, 63, 86)')
 assert.equal((await inspect()).rowBackground,'rgb(23, 63, 86)')
 assert.equal((await inspect()).text,'rgb(238, 248, 255)')
 await row.locator('.n-tree-node-content').click();await page.waitForTimeout(30)
 assert.equal((await inspect()).text,'rgb(238, 248, 255)')
 assert.equal((await inspect()).innerBackground,'rgba(0, 0, 0, 0)')
 await page.locator('.sidebar').screenshot({path:output+'/custom-marker.png',animations:'disabled'})
 checks.push('Custom background, text and icon remain on the entire row and selection keeps custom text color')
  await row.click({button:'right'})
  await page.locator('.n-dropdown-menu').getByText('编辑显示样式',{exact:true}).waitFor()
  await page.mouse.click(800,500)

 const folder=tree.locator('.n-tree-node[data-drop-path="C:/workflow-fixture/Inbox"]'),switcher=folder.locator('.n-tree-node-switcher')
 await switcher.click()
 await tree.getByText('灵感.md',{exact:true}).waitFor()
 assert.equal(await switcher.getAttribute('class').then(c=>c.includes('--expanded')),true)
 assert.equal(await switcher.evaluate(el=>getComputedStyle(el).transform),'none')
 assert.equal(await switcher.locator('.n-tree-node-switcher__icon').evaluate(el=>getComputedStyle(el).transform),'matrix(0, 1, -1, 0, 0, 0)')
 await switcher.hover()
 assert.equal(await switcher.locator('.n-tree-node-switcher__icon').evaluate(el=>getComputedStyle(el).transform),'matrix(0, 1, -1, 0, 0, 0)')
 await switcher.click();await tree.getByText('灵感.md',{exact:true}).waitFor({state:'hidden'})
 checks.push('Folder loading/expansion works; hovering an expanded arrow keeps its rotation and stable hit area')
 await tree.focus();await page.keyboard.press('ArrowDown')
 await tree.locator('.n-tree-node--pending').first().waitFor()
 assert.equal(await tree.locator('.n-tree-node--pending').first().evaluate(el=>getComputedStyle(el).outlineStyle),'solid')
 await row.click({button:'right'})
  await page.locator('.n-dropdown-menu').getByText('批量重命名不可用',{exact:true}).waitFor()
  assert.equal(await tree.locator('.n-tree-node--selected').count(),2)
 checks.push('Keyboard focus, single-file menu and existing multi-selection context menu remain reachable')
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks,states,errors,scope:'Actual App and Naive UI file tree, isolated mock Tauri IPC; no user files or native move/delete.'},null,2)+'\n')
 console.log(JSON.stringify({checks,states:states.length,errors}))
}finally{await browser.close()}
