import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {mobileHelpTopics} from '../src/mobile/mobileHelp.ts'
import {compileMobileVuePrototype} from './compile-mobile-vue-prototype.mjs'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright'),[out]=process.argv.slice(2)
assert.ok(out);await assert.rejects(access(out+'/report.json'));await mkdir(out,{recursive:true})
const id=JSON.stringify(['local','独立笔记.md']),doc={rootId:'local',relativePath:'独立笔记.md',content:'# 原文😀\r\n保持原样\r\n',signature:'old',modified:1},draft={...doc,content:'未保存草稿😎\r\n',expectedSignature:'old',revision:7,updated:1},key='longedit-mobile-preview-v1'
const report={scope:'Production app Help plus the actual shared Help component across all topics. Browser keyboard/AX/axe are not Android TalkBack/IME.',checks:[],componentTopics:[],scans:[],screens:[],errors:[],passed:false}
const browser=await chromium.launch({channel:'chrome',headless:true});let page,context,cdp
const button=name=>page.getByRole('button',{name,exact:true}),help=()=>page.locator('.mobile-help-dialog'),body=()=>page.locator('.mobile-help-content')
async function axText(){
 cdp??=await context.newCDPSession(page)
 const tree=await cdp.send('Accessibility.getFullAXTree');return tree.nodes.filter(n=>!n.ignored).map(n=>n.name?.value||'').join('\n')
}
async function paragraphs(topic){const text=await axText();for(const p of mobileHelpTopics[topic].paragraphs)assert.ok(text.includes(p),'Browser AX paragraph missing: '+topic);assert.deepEqual(await body().locator('p').allTextContents(),mobileHelpTopics[topic].paragraphs)}
async function shot(name){await page.screenshot({path:out+'/'+name+'.png'});report.screens.push({name,dialog:await help().boundingBox(),body:await body().boundingBox()})}
async function scan(name){
 await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'),'utf8'))
 const result=await page.evaluate(async()=>axe.run(document,{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}))
 report.scans.push({name,violations:result.violations.map(({id,nodes})=>({id,targets:nodes.map(n=>n.target)})),incomplete:result.incomplete.map(({id,nodes})=>({id,targets:nodes.map(n=>n.target)}))});assert.deepEqual(report.scans.at(-1).violations,[],name)
}
async function preserved(){const data=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.deepEqual(data.documents[id],doc);assert.deepEqual(data.drafts[id],draft)}
try{
 context=await browser.newContext({viewport:{width:390,height:872},isMobile:true,hasTouch:true,reducedMotion:'reduce',colorScheme:'light'})
 await context.addInitScript(({key,id,doc,draft})=>{if(window===top&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,documents:{[id]:doc},drafts:{[id]:draft}}))},{key,id,doc,draft})
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)))
 await page.goto('http://127.0.0.1:9012/mobile.html');await button('资料库说明').tap();await help().waitFor();await paragraphs('library');await shot('library-normal');await scan('library-normal')
 assert.equal(await page.locator('.mobile-workspace').evaluate(e=>e.inert),true)
 const freeze=JSON.parse(await readFile('docs/design/mobile-native-accessibility-v1/prototype/freeze.json','utf8')),reference=freeze.screens.find(s=>s.variant==='candidate'&&s.topic==='library'&&s.width===390)
 const geometry=report.screens.at(-1);for(const k of ['width','height']){assert.ok(Math.abs(geometry.dialog[k]-reference.dialog[k])<.2,k);assert.ok(Math.abs(geometry.body[k]-reference.body[k])<.2,'body '+k)}
 report.alignment={reference:reference.name,dialog:geometry.dialog,body:geometry.body,expectedViewportDifference:28,actualDialogOffset:geometry.dialog.y-reference.dialog.y}
 await page.keyboard.press('Escape');await help().waitFor({state:'hidden'});assert.equal(await button('资料库说明').evaluate(e=>e===document.activeElement),true);await preserved()
 report.checks.push('Production help retains actual paragraphs in browser AX, shields background, matches frozen component size, and Escape restores its question-mark opener with document/draft bytes exact')
 await button('资料库说明').tap();await help().waitFor();await page.setViewportSize({width:320,height:372});await page.evaluate(()=>document.documentElement.style.fontSize='32px');await page.waitForTimeout(150)
 const close=await button('关闭说明').boundingBox();assert.ok(close.x>=0&&close.y>=0&&close.x+close.width<=320&&close.y+close.height<=372&&close.width>=48&&close.height>=48)
 await page.keyboard.press('Tab');assert.equal(await button('关闭说明').evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await body().evaluate(e=>e===document.activeElement),true)
 assert.ok(await body().evaluate(e=>e.scrollHeight>e.clientHeight));await shot('library-short-before')
 await page.keyboard.press('PageDown');await page.waitForFunction(()=>document.querySelector('.mobile-help-content').scrollTop>0);await page.keyboard.press('End')
 await page.waitForFunction(()=>{const e=document.querySelector('.mobile-help-content');return Math.abs(e.scrollTop+e.clientHeight-e.scrollHeight)<2})
 assert.ok(await body().evaluate(e=>Math.abs(e.scrollTop+e.clientHeight-e.scrollHeight)<2));await paragraphs('library');await shot('library-short-end');await scan('library-short-end')
 await page.keyboard.press('Escape');await help().waitFor({state:'hidden'});assert.equal(await button('资料库说明').evaluate(e=>e===document.activeElement),true);await preserved()
 report.checks.push('320×372 at 200% preserves the visible 48px close action; Tab reaches the scroll body, PageDown/End reach all text, and Escape returns to the same opener')
 await page.setViewportSize({width:390,height:872});await page.evaluate(()=>document.documentElement.style.fontSize='16px')
 await button('设置').tap();await page.locator('[data-focus-key="settings-appearance"]').tap();await page.locator('[data-focus-key="settings-theme"]').tap();await page.locator('.theme-choice-sheet [aria-label="外观说明"]').tap();await help().waitFor();await paragraphs('appearance');await shot('appearance-nested');await scan('appearance-nested')
 assert.equal(await page.locator('.sheet-backdrop').evaluate(e=>e.inert),true)
 await page.evaluate(()=>window.__longeditMobileBack());await help().waitFor({state:'hidden'});assert.equal(await page.locator('.theme-choice-sheet [aria-label="外观说明"]').evaluate(e=>e===document.activeElement),true)
 await page.evaluate(()=>window.__longeditMobileBack());await page.locator('.theme-choice-sheet').waitFor({state:'hidden'});assert.equal(await page.locator('[data-focus-key="settings-theme"]').evaluate(e=>e===document.activeElement),true);await preserved()
 report.checks.push('Production nested Theme/Help keeps paragraph text and consumes one Back per layer, restoring both the question mark and theme row')
 await context.close();cdp=null
 context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)))
 const entry="import{createApp,h}from'vue';import Host from'./src/mobile/MobileHelpHost.vue';import{mobileHelpState,openMobileHelp}from'./src/mobile/mobileHelp.ts';window.__open=topic=>openMobileHelp(topic,document.querySelector('#trigger'));createApp({render:()=>h('main',{class:'mobile-app'},[h('section',{class:'mobile-workspace',inert:!!mobileHelpState.value},h('button',{id:'trigger'},'打开说明')),h(Host)])}).mount('#app');"
 const cssFile=/href="([^"]+\.css)"/.exec(await readFile('dist/mobile.html','utf8'))[1].replace(/^\.\//,'dist/'),css=await readFile(cssFile,'utf8'),bundle=await compileMobileVuePrototype(entry)
 await page.route('http://127.0.0.1:9012/help-body-component.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>说明正文组件核对</title><style>'+css+'</style><div id="app"></div><script>'+bundle+'</script></html>'}))
 await page.goto('http://127.0.0.1:9012/help-body-component.html')
 for(const [topic,value]of Object.entries(mobileHelpTopics)){
  await page.evaluate(topic=>window.__open(topic),topic);await help().waitFor();await page.waitForFunction(title=>document.querySelector('#mobile-help-title')?.textContent===title,value.title);await paragraphs(topic)
  if(topic==='import'){await page.getByText('支持的源码格式',{exact:true}).click();assert.ok(await body().locator('li').count()>10);await scan('component-import-expanded')}
  await page.keyboard.press('Tab');assert.equal(await button('关闭说明').evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await body().evaluate(e=>e===document.activeElement),true)
  await page.keyboard.press('Escape');await help().waitFor({state:'hidden'});assert.equal(await page.locator('#trigger').evaluate(e=>e===document.activeElement),true)
  report.componentTopics.push({topic,title:value.title,paragraphs:value.paragraphs.length,axTextVerified:true,keyboardAndReturnVerified:true})
 }
 assert.deepEqual(report.errors,[]);report.passed=true
}catch(error){report.failure=String(error.stack||error);if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw error}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify({out,productionGroups:report.checks.length,componentTopics:report.componentTopics.length,scans:report.scans.length,passed:report.passed}))
