import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-yaml-redesign'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}})
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/yaml-redesign-browser.html')
 await page.locator('.outline-list button').first().waitFor()
 await page.locator('.cm-content').click()
 await page.keyboard.press('Control+End')
 await page.keyboard.insertText('# 用户的备注')
 const draft=await page.locator('.cm-content').innerText()
 assert.ok(await page.getByRole('button',{name:'保存',exact:true}).isEnabled())
 await page.getByTitle('查找（Ctrl+F）',{exact:true}).click()
 await page.locator('.cm-search').waitFor()
 await page.keyboard.press('Escape')
 await page.screenshot({path:output+'/01-wide.png',animations:'disabled'})
 for(const narrowWindow of [false,true]) {
  if(narrowWindow) {
   await page.setViewportSize({width:480,height:900})
   await page.locator('.inspector').waitFor({state:'hidden'})
  }
  else await page.evaluate(()=>document.querySelector('#app').style.width='480px')
  const toggle=page.getByRole('button',{name:'结构与问题',exact:true})
  if(await toggle.getAttribute('aria-pressed')==='false')await toggle.click()
  const source=await page.locator('.source-pane').boundingBox(),inspector=await page.locator('.inspector').boundingBox()
  assert.ok(source.width>450 && source.height>200)
  assert.ok(inspector.y>=source.y+source.height-1)
  for(const title of ['折叠全部','展开全部','重新读取'])assert.ok(await page.getByTitle(title,{exact:true}).isVisible())
  await page.getByTitle('折叠全部',{exact:true}).click()
  await page.getByTitle('展开全部',{exact:true}).click()
  await page.getByPlaceholder('筛选路径或内容').fill('title')
  assert.equal(await page.locator('.outline-list button').count(),1)
  await page.locator('.outline-list button').click()
  assert.ok(await page.locator('.cm-content').isVisible())
  assert.equal(await page.locator('.cm-content').innerText(),draft)
  await page.screenshot({path:output+`/02-${narrowWindow?'window':'container'}-480.png`,animations:'disabled'})
  await toggle.click()
  assert.equal(await page.locator('.inspector').isVisible(),false)
  assert.equal(await page.locator('.cm-content').innerText(),draft)
  await toggle.click()
 }
 assert.deepEqual(errors,[])
 assert.equal(await page.evaluate(()=>window.yamlAudit.calls.filter(c=>c.command.startsWith('write_')).length),0)
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Draft and search','Fold/unfold remain available','Filtered outline locates source without hiding it','480px container and window layout','Inspector toggle preserves draft'],errors,scope:'Actual YamlEditorView and CodeMirror; native read and analysis mocked, no native writing or YAML parser acceptance',releaseCandidate:false},null,2)+'\n')
 console.log('YAML actual-page layout and interaction checks passed')
} finally {await browser.close()}
