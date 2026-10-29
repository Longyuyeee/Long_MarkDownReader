import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=resolve(process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/v1314-browser'),base=process.env.LONGEDIT_BROWSER_BASE||'http://127.0.0.1:15989'
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-proxy-server']}),checks=[],layouts=[];let page
try{
 for(const mode of ['wysiwyg','ir','sv']){
  page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/scripts/fixtures/v1314-library-links-browser.html?editor='+mode,{waitUntil:'domcontentloaded',timeout:120000})
  const selector=mode==='sv'?'#vditor-lib .vditor-sv':`#vditor-lib .vditor-${mode} > pre`,source=()=>page.locator(selector)
  const ready=async name=>{await page.waitForFunction(name=>shellAudit.store.activeTabId==='C:/shell-fixture/'+name,name);await source().waitFor({state:'visible'});await page.waitForTimeout(200)}
  const menu=()=>page.locator('[data-testid=library-document-menu]').click()
  const back=async()=>{await menu();await page.locator('[data-testid=library-link-source-return]').click();await ready('A.md')}
  const point=()=>source().evaluate(root=>{const s=getSelection(),offset=(n,o)=>{if(!n||!root.contains(n))return null;const r=document.createRange();r.selectNodeContents(root);r.setEnd(n,o);return r.toString().length};return{top:root.scrollTop,left:root.scrollLeft,anchor:offset(s?.anchorNode,s?.anchorOffset),focus:offset(s?.focusNode,s?.focusOffset),selected:s?.toString()}})
  const same=(actual,expected)=>{assert.equal(actual.anchor,expected.anchor,JSON.stringify({mode,actual,expected}));assert.equal(actual.focus,expected.focus);assert.equal(actual.selected,expected.selected);assert.ok(Math.abs(actual.top-expected.top)<3,JSON.stringify({mode,actual,expected}));assert.ok(Math.abs(actual.left-expected.left)<3)}
  const tab=async name=>{await page.locator(`[data-drop-path="C:/shell-fixture/${name}"]`).first().click();await ready(name)}
  const draft=async name=>page.evaluate(name=>shellAudit.store.tabs.find(t=>t.path.endsWith('/'+name)).content,name)
  const settled=()=>page.waitForFunction(()=>{let vm=document.querySelector('#vditor-lib').__vueParentComponent;while(vm&&!vm.setupState?.vditor)vm=vm.parent;const editor=vm?.setupState?.vditor;return editor&&shellAudit.store.tabs.find(t=>t.id===shellAudit.store.activeTabId)?.content===editor.getValue()})
  const undo=async()=>{await page.keyboard.press('Control+z');await settled()},redo=async()=>{await page.keyboard.press('Control+y');await settled()}
  const append=async text=>{await source().click({position:{x:12,y:12}});await page.keyboard.press('Control+End');await page.keyboard.insertText(text);await page.waitForTimeout(1000)}
  const wiki=async()=>{await page.locator('#tab-links').click();await page.locator('.relation-list .relation-note').filter({hasText:'B'}).first().click();await ready('B.md')}
  await ready('A.md');await append('来源未保存'+mode);for(let i=0;i<4;i++)await page.keyboard.press('Shift+ArrowLeft');const origin=await point();assert.ok(origin.top>0)
  await wiki();assert.match(await draft('A.md'),new RegExp('来源未保存'+mode));assert.equal(await page.evaluate(()=>shellAudit.store.tabs.length),4)
  await page.locator('.workspace-tab[aria-label^="B.md"]').dragTo(page.locator('.workspace-tab[aria-label="D.txt"]'))
  assert.ok((await page.evaluate(()=>shellAudit.store.activeTabId)).endsWith('/B.md'))
  await append('目标未保存'+mode);const targetDraft=await draft('B.md');if(mode==='wysiwyg'){assert.equal(targetDraft,(await page.evaluate(()=>shellAudit.disk.get('C:/shell-fixture/B.md'))).trimEnd()+'目标未保存'+mode+'\n');assert.equal(await draft('A.md'),(await page.evaluate(()=>shellAudit.disk.get('C:/shell-fixture/A.md'))).trimEnd()+'来源未保存'+mode+'\n')}await undo();await page.waitForTimeout(180);assert.ok(!(await draft('B.md')).includes('目标未保存'));assert.ok(!(await draft('B.md')).includes('第79段'));await redo();await page.waitForTimeout(180);assert.equal(await draft('B.md'),targetDraft)
  await back();same(await point(),origin);assert.match(await draft('A.md'),new RegExp('来源未保存'+mode));await undo();await page.waitForTimeout(180);assert.ok(!(await draft('A.md')).includes('来源未保存'));assert.ok((await draft('A.md')).includes('第79段'));await redo();await page.waitForTimeout(180);assert.match(await draft('A.md'),new RegExp('来源未保存'+mode))
  await page.locator('#tab-files').click();await tab('B.md');await source().click({position:{x:12,y:12}});await undo();await page.waitForTimeout(180);assert.ok(!(await draft('B.md')).includes('目标未保存'));await redo();await page.waitForTimeout(180);assert.equal(await draft('B.md'),targetDraft);await menu();assert.equal(await page.locator('[data-testid=library-link-source-return]').count(),0);await menu();await tab('A.md')
  checks.push({mode,case:'wiki-roundtrip',status:'passed',bothDrafts:true,bothUndoRedo:true,selectionAndScroll:true,reusedTabs:true,tabReorderPreserved:true,ordinaryTabSwitchNotRecorded:true})
  if(mode==='wysiwyg'){
   for(const target of ['B.md','C.json','D.txt']){
    await page.locator(`#vditor-lib a[href="${target}"]`).last().click();await page.waitForFunction(target=>shellAudit.store.activeTabId.endsWith('/'+target),target);await page.waitForTimeout(350)
    await page.evaluate(async()=>{const {contextCommands}=await import('/src/services/contextCommands.ts');window.oldReturn=contextCommands.capture().find(c=>c.id==='link-source-return')});await back();assert.match(await draft('A.md'),/来源未保存/)
    assert.match(await page.evaluate(async()=>{try{await oldReturn.run();return 'wrongly-ran'}catch(e){return e.message}}),/文件已切换/)
    checks.push({mode,case:'local-'+target,status:'passed',staleCommandRejected:true})
   }
   await page.evaluate(()=>{shellAudit.failStats=true});await page.locator('#vditor-lib a[href="B.md"]').last().click();await page.waitForTimeout(180);assert.ok((await page.evaluate(()=>shellAudit.store.activeTabId)).endsWith('/A.md'));await page.evaluate(()=>{shellAudit.failStats=false})
   await page.locator('#vditor-lib a[href="B.md"]').last().click();await ready('B.md');await page.evaluate(()=>{shellAudit.failStats=true});await menu();await page.locator('[data-testid=library-link-source-return]').click();await page.waitForTimeout(180);assert.ok((await page.evaluate(()=>shellAudit.store.activeTabId)).endsWith('/B.md'));assert.equal(await draft('B.md'),targetDraft);await page.evaluate(()=>{shellAudit.failStats=false});await back()
   checks.push({mode,case:'missing-target-and-source',status:'passed',currentPageUsable:true,bothDrafts:true})
   await page.evaluate(()=>{shellAudit.statsWait=new Promise(resolve=>shellAudit.releaseStats=resolve)});await page.locator('#vditor-lib a[href="B.md"]').last().click();await append('点击后继续输入');await page.evaluate(()=>{shellAudit.releaseStats();shellAudit.statsWait=undefined});await page.waitForTimeout(180);assert.ok((await page.evaluate(()=>shellAudit.store.activeTabId)).endsWith('/A.md'));assert.match(await draft('A.md'),/点击后继续输入/)
   checks.push({mode,case:'late-open-after-input',status:'passed',currentDraftPreserved:true})
  }
  await wiki()
  for(const style of ['soft','neo','glass','minimal','sharp','airy'])for(const width of [1440,800,640]){
   await page.setViewportSize({width,height:width===640?720:900});await page.evaluate(style=>{shellAudit.store.visualStyle=style},style);await menu();await page.locator('[data-testid=library-link-source-return]').waitFor();await page.waitForTimeout(180)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);layouts.push({mode,style,width,status:'passed'})
   if(style==='minimal'&&width!==800){await page.waitForTimeout(200);await page.screenshot({path:resolve(output,mode+'-'+width+'.png'),fullPage:true})}
   await menu()
  }
  await page.evaluate(()=>{shellAudit.store.theme='dark'});await menu();await page.waitForTimeout(350);await page.screenshot({path:resolve(output,mode+'-dark-640.png'),fullPage:true});await menu();await back()
  assert.equal(await page.evaluate(()=>shellAudit.calls.filter(c=>c.command.startsWith('write_')).length),0);assert.deepEqual(errors,[])
  checks.push({mode,case:'all-styles-and-windows',status:'passed',combinations:18,noWrites:true});console.log('Link source return',mode,'passed');await page.close();page=undefined
 }
 page=await browser.newPage({viewport:{width:1280,height:820}});const ownerErrors=[];page.on('pageerror',e=>ownerErrors.push(e.message));await page.goto(base+'/scripts/fixtures/v1314-library-links-browser.html',{waitUntil:'domcontentloaded',timeout:120000});await page.locator('#vditor-lib .vditor-wysiwyg > pre').waitFor();await page.waitForTimeout(250)
 const active=async name=>{await page.waitForFunction(name=>shellAudit.store.activeTabId.endsWith('/'+name),name);await page.waitForTimeout(200)}
 const localOpen=async()=>{await page.locator('#vditor-lib a[href="B.md"]').last().click();await active('B.md')}
 const fileOpen=async name=>{await page.locator(`[data-drop-path="C:/shell-fixture/${name}"]`).first().click();await active(name)}
 const noReturn=async()=>{await page.locator('[data-testid=library-document-menu]').click();assert.equal(await page.locator('[data-testid=library-link-source-return]').count(),0);await page.locator('[data-testid=library-document-menu]').click()}
 await localOpen();await page.locator('[aria-label="关闭标签：A.md"]').click();await noReturn();await fileOpen('A.md');await localOpen();await fileOpen('A.md');await page.locator('[data-testid=library-document-menu]').click();await page.getByRole('button',{name:'重新读取文件',exact:true}).click();await page.locator('[data-testid=library-document-menu]').click();await page.waitForTimeout(250);await fileOpen('B.md');await noReturn();checks.push({case:'closed-and-reloaded-source',status:'passed',actualUserActions:true})
 await fileOpen('A.md');await localOpen();await page.locator('[data-drop-path="C:/shell-fixture/A.md"]').click({button:'right'});await page.locator('.n-dropdown-option-body__label:visible').filter({hasText:/^重命名/}).click();await page.locator('#library-rename-input input').fill('A-renamed.md');await page.getByRole('button',{name:'更新名称',exact:true}).click();await page.waitForFunction(()=>shellAudit.store.tabs.some(t=>t.path==='C:/shell-fixture/A-renamed.md'));await page.locator('[data-testid=library-document-menu]').click();await page.locator('[data-testid=library-link-source-return]').click();await active('A-renamed.md');assert.ok((await page.locator('.vditor-wysiwyg > pre').innerText()).includes('第79段'));assert.deepEqual(ownerErrors,[]);checks.push({case:'renamed-source',status:'passed',actualUserActions:true,reusedOriginalTab:true});await page.close();page=undefined
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'passed',nativeBridgeMocked:true,sourceUserContentIncluded:false,checks,layouts},null,2)+'\n');console.log('Link source return: 3 modes, 54 style-window combinations and actual close/reload/rename passed')
}catch(error){await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error.stack),checks,layouts},null,2));throw error}finally{await browser.close()}
