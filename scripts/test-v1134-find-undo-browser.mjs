// Real production find and Vditor undo through the browser fixture.
// Vary normal click timing to catch delayed caret-only history checkpoints.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),output=process.env.LONGEDIT_TEST_OUTPUT||'docs/evidence/v1134-development/find-undo-browser',base='http://127.0.0.1:9035'
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:850}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));page.setDefaultTimeout(20000)
const modal=()=>page.locator('.document-find-dialog'),query=()=>modal().getByRole('textbox',{name:'查找内容',exact:true}),replacement=()=>modal().getByRole('textbox',{name:'替换内容',exact:true}),button=text=>modal().getByRole('button',{name:text,exact:true}),content=()=>page.evaluate(()=>window.workflowAudit.store.tabs.find(t=>t.path.endsWith('/项目方案.md')).content),mark=id=>checks.push({id,status:'passed'})
async function close(){await button('关闭').click();await modal().waitFor({state:'hidden'})}
async function open(){await page.keyboard.press('Control+h');await modal().waitFor()}
try{
 for(let round=0;round<4;round++){
 await page.goto(base+'/scripts/fixtures/v1125-find-browser.html',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('link',{name:'资料库',exact:true}).click();await page.locator('.inline-mode').waitFor()
 for(const[mode,label]of [['wysiwyg','所见即所得'],['ir','即时渲染 IR'],['sv','源码编辑']]){
  await page.locator('.inline-mode').click();await page.getByText(label,{exact:true}).click();await page.waitForFunction(m=>window.workflowAudit.store.editorMode===m,mode)
  const tail=page.locator('#vditor-lib .vditor-'+mode).getByText('结尾保留。',{exact:true});await tail.click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.insertText('未保存的输入 '+mode);await page.waitForFunction(m=>window.workflowAudit.store.tabs[0].content.includes('未保存的输入 '+m),mode)
  const paragraph=page.locator('#vditor-lib .vditor-'+mode).getByText('第二段 用户 之外 用户。',{exact:true});await paragraph.waitFor();await paragraph.click();await page.keyboard.press('Home');for(let n=0;n<4;n++)await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');assert.equal(await page.evaluate(()=>window.getSelection().toString()),'用户')
  const before=await content();await page.evaluate(text=>window.__expectedFindDraft=text,before);await open();assert.equal(await query().inputValue(),'用户');await modal().getByText('1 / 1 处',{exact:true}).waitFor();await replacement().fill('访客');await button('替换这一处').click();await page.waitForFunction(text=>window.workflowAudit.store.tabs[0].content===text,before.replace('第二段 用户','第二段 访客'));await close();await page.waitForTimeout(round%4*100);await page.locator('#vditor-lib button[data-type="undo"]').click();await page.waitForFunction(text=>window.workflowAudit.store.tabs[0].content===text,before);mark(round+'-'+mode+'-selected-duplicate-only-and-single-undo')
 }

 }
 assert.deepEqual(errors,[]);await fs.writeFile(output+'/report.json',JSON.stringify({nativeBridgeMocked:true,desktopInputUsed:false,undoDelaysMs:[0,100,200,300],checks,errors},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length,errors}));
}catch(error){await fs.writeFile(output+'/failure.json',JSON.stringify({error:String(error.stack||error),draft:await content(),before:await page.evaluate(()=>window.__expectedFindDraft),checks,errors},null,2));await page.screenshot({path:output+'/failure.png'});throw error}finally{await browser.close()}
