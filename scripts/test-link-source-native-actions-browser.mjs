// Trusted CDP actions in production Vue, with mocked file IPC; not installed proof.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
import {installedMarkdownValueExpression} from './lib/installed-markdown-observation.mjs'
import {linkSourceRefreshSelector,linkSourcePathKey} from './lib/installed-v1-3-14-workflow.mjs'
import {linkSourceText,linkSourceAddition,linkTargetAddition,linkSourceDraft,linkTargetDraft,linkPlainDraft} from './lib/link-source-fixture.mjs'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),q=JSON.stringify
const base=process.env.LONGEDIT_PRODUCTION_BROWSER_BASE||'http://127.0.0.1:15990',output=process.env.LONGEDIT_BROWSER_OUTPUT||'.release-secrets/production-native-actions',browser=await chromium.launch({headless:true,args:['--no-proxy-server']})
const page=await browser.newPage({viewport:{width:1280,height:820}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(base+'/scripts/fixtures/v1314-library-links-browser.html?crlf=1');await page.locator('#vditor-lib .vditor-wysiwyg > pre').waitFor()
 const session=await page.context().newCDPSession(page),send=(m,a)=>session.send(m,a),evaluate=e=>page.evaluate(e),ui=nativeUserInput({send,evaluate},{timeoutMs:15000}),source='#vditor-lib .vditor-wysiwyg > pre',store='shellAudit.store',root='C:/shell-fixture/'
 const value=()=>evaluate(installedMarkdownValueExpression),active=n=>ui.waitFor('('+linkSourcePathKey.toString()+')('+store+'.activeTabId)==='+q(linkSourcePathKey((root+n).replaceAll('/','\\'))),'active '+n),pause=ms=>page.waitForTimeout(ms)
 const menu=()=>ui.click('[data-testid=library-document-menu]'),back=async n=>{await menu();await ui.click('[data-testid=library-link-source-return]');await active(n);await pause(250)}
 const exact=text=>ui.waitFor(installedMarkdownValueExpression+'==='+q(text)+'&&'+store+'.tabs.find(t=>t.id==='+store+'.activeTabId)?.content==='+q(text),'exact draft')
 const append=async text=>{await ui.clickTarget('document.querySelector('+q(source)+').lastElementChild');await ui.key('End','End',35,2);await send('Input.insertText',{text});await pause(1100)}
 const link=async(name,n)=>{await ui.clickTarget('[...document.querySelectorAll("#vditor-lib a[href]")].filter(e=>e.getAttribute("href")==='+q(name)+').at(-1)');await active(n);await pause(250)}
 const point=()=>evaluate('(()=>{const r=document.querySelector('+q(source)+'),s=getSelection(),offset=(n,o)=>{const a=document.createRange();a.selectNodeContents(r);a.setEnd(n,o);return a.toString().length};return{anchor:offset(s.anchorNode,s.anchorOffset),focus:offset(s.focusNode,s.focusOffset),top:r.scrollTop,left:r.scrollLeft}})()')
 await ui.click('#tab-files');await ui.click(linkSourceRefreshSelector);await menu();await ui.clickText('.mode-toggle button','所见');await menu();await pause(300);const baseline=await value()
 await append(linkSourceAddition);await exact(linkSourceDraft);for(let i=0;i<4;i++)await ui.key('ArrowLeft','ArrowLeft',37,8);const origin=await point()
 await link('B.md','B.md');const targetBaseline=await value();await append(linkTargetAddition);await exact(linkTargetDraft);await ui.key('z','KeyZ',90,2);await exact(targetBaseline);await ui.key('y','KeyY',89,2);await exact(linkTargetDraft)
 await back('A.md');const current=await point();assert.equal(current.anchor,origin.anchor);assert.equal(current.focus,origin.focus);assert.ok(Math.abs(current.top-origin.top)<3);await exact(linkSourceDraft);await ui.key('z','KeyZ',90,2);await exact(baseline);await ui.key('y','KeyY',89,2);await exact(linkSourceDraft);checks.push('native-keyboard-two-drafts-return-selection-and-undo-redo')
 await link('C.json','C.json');await page.locator('.json-workspace').waitFor();await back('A.md');await exact(linkSourceDraft);checks.push('structured-target-return')
 await link('D.txt','D.txt');await ui.fill('.text-workspace .cm-content',linkPlainDraft);await back('A.md');await exact(linkSourceDraft);assert.equal(await evaluate(store+'.tabs.find(t=>t.path.endsWith("D.txt")).content'),linkPlainDraft);checks.push('text-target-draft-return')
 await ui.click('#tab-links');await ui.clickTarget('[...document.querySelectorAll(".relation-list .relation-note")].find(e=>e.textContent.trim()==="B")');await active('B.md');await back('A.md');await ui.click('#tab-files');checks.push('wiki-return')
 await evaluate('shellAudit.disk.set('+q(root+'E.md')+','+q(linkSourceText)+')');await ui.click(linkSourceRefreshSelector);await ui.click('[data-drop-path="'+root+'E.md"]');await active('E.md');await pause(250);await link('B.md','B.md')
 await ui.clickTarget('document.querySelector('+q('[data-drop-path="'+root+'E.md"]')+')','right');await ui.clickTarget('[...document.querySelectorAll(".n-dropdown-option-body__label")].find(e=>e.getClientRects().length&&e.textContent.trim().startsWith("重命名"))');await ui.fill('#library-rename-input input','改名来源.md');await ui.clickText('.n-dialog__action button','更新名称');await back('改名来源.md');assert.equal((await value()).trimEnd(),linkSourceText.trimEnd());checks.push('source-renamed-return')
 await link('B.md','B.md');await evaluate('shellAudit.failStats=true');await menu();await ui.click('[data-testid=library-link-source-return]');await pause(250);await active('B.md');await exact(linkTargetDraft);await evaluate('shellAudit.failStats=false');await back('改名来源.md');checks.push('local-failure-retry')
 await link('B.md','B.md');await ui.click('[data-drop-path="'+root+'改名来源.md"]');await active('改名来源.md');await menu();await ui.clickText('.tab-actions button','重新读取文件');await menu();await pause(300);await ui.click('[data-drop-path="'+root+'B.md"]');await active('B.md');await menu();assert.equal(await page.locator('[data-testid=library-link-source-return]').count(),0);await menu();checks.push('source-reload-invalidates')
 assert.deepEqual(errors,[]);await mkdir(output,{recursive:true});await writeFile(output+'/production-native-actions.json',JSON.stringify({status:'passed',productionVue:true,nativeBridgeMocked:true,mixedWindowsPathExpectations:true,checks,runtimeErrors:errors},null,2)+'\n');console.log('Production trusted actions passed',checks.length)
}catch(error){await mkdir(output,{recursive:true});await page.screenshot({path:output+'/failure.png'});console.error('Completed',checks);throw error}finally{await browser.close()}
