// Real Vditor input comparison. Simulated file IPC, never installed proof.
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1114-native-input-comparison'
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}),context=await browser.newContext({permissions:['clipboard-read','clipboard-write']}),page=await context.newPage()
const text='# 输入测试\n\n## 第一节\n\n保留中文段落。\n\n| 任务 | 状态 |\n| --- | --- |\n| 整理 | 继续 |\n'
const report={evidenceLevel:'real-Vditor-simulated-file-IPC-input-comparison',observations:[]}
try{
 for(const input of ['cdp-insertText','actual-clipboard-paste','ordinary-enter-keys']){
  await page.goto('http://127.0.0.1:9022/scripts/fixtures/library-shell-browser.html');await page.locator('#vditor-lib [contenteditable=true]').first().waitFor()
  await page.locator('.inline-mode').click();await page.getByText('源码编辑',{exact:true}).click();const editor=page.locator('#vditor-lib .vditor-sv');await editor.click();await page.keyboard.press('Control+a')
  if(input==='cdp-insertText')await page.keyboard.insertText(text)
  else if(input==='actual-clipboard-paste'){await page.evaluate(text=>navigator.clipboard.writeText(text),text);await page.keyboard.press('Control+v')}
  else {const lines=text.split('\n');for(let n=0;n<lines.length;n++){if(n)await page.keyboard.press('Enter');if(lines[n])await page.keyboard.insertText(lines[n])}}
  await page.waitForTimeout(350)
  const value=await page.evaluate(()=>({content:shellAudit.store.tabs.find(t=>t.id===shellAudit.store.activeTabId).content,html:document.querySelector('#vditor-lib .vditor-sv').innerHTML}))
  await page.getByRole('button',{name:'导出',exact:true}).click();await page.getByText('导出 HTML',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('.writing-delivery-dialog iframe')?.contentDocument?.querySelector('main'))
  value.tables=await page.frameLocator('.writing-delivery-dialog iframe').locator('table').count();value.headings=await page.frameLocator('.writing-delivery-dialog iframe').locator('h2').count();report.observations.push({input,expected:text,...value});await page.screenshot({path:output+'/'+input+'.png'})
 }
}finally{await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
console.log(JSON.stringify(report.observations.map(o=>({input:o.input,exact:o.content===text,tables:o.tables,headings:o.headings}))))
