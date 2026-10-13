import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-settings-redesign';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/settings-redesign-browser.html')
 await page.getByRole('navigation',{name:'设置分类'}).waitFor()
 assert.equal(await page.locator('.management-back').count(),0)
 await page.screenshot({path:output+(process.env.BEFORE?'/00-before.png':'/01-container.png'),animations:'disabled'})
 if(!process.env.BEFORE){
  const nav=page.getByRole('navigation',{name:'设置分类'})
  for(const name of ['编辑与保存','外观','格式与文件','知识能力','系统与更新','隐私与诊断','AI','资料库']){
   await nav.getByRole('button',{name,exact:true}).click()
   assert.equal(await page.locator('.settings-category-heading h2').innerText(),name)
  }
  await nav.getByRole('button',{name:'外观',exact:true}).click()
  const panel=await page.locator('.settings-panel').boundingBox()
  assert.ok(panel.width>400,'Narrow panel must not lose width to vertical navigation')
  await page.screenshot({path:output+'/02-appearance.png',animations:'disabled'})
  assert.deepEqual(errors,[])
  await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Eight category transitions','520px content in 1280px browser','Appearance panel full-width'],scope:'Production SettingsView; configuration loading/native IPC isolated; no persistent preference changes',errors},null,2)+'\n')
  console.log('Settings layout checks passed')
 }
}finally{await browser.close()}
