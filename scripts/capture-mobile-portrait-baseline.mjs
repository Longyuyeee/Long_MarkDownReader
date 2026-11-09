import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,access} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{chromium}=require(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const out=process.argv[2]||'docs/evidence/mobile-0.1.0/portrait-comfort-2026-11-05'
await assert.rejects(access(out));await mkdir(out,{recursive:true});await writeFile(out+'/.gitignore','*\n!.gitignore\n')
export const portraitNames=['今天的阅读笔记.md','项目待办.md','旅行清单.txt','读书/第一章.md','会议记录.md','灵感收集.md','这个名称很长的文稿用于确认手机竖屏下文件名称不会把列表挤成多行大卡片.md']
const documents=Object.fromEntries(portraitNames.map((name,n)=>[JSON.stringify(['local',name]),{rootId:'local',relativePath:name,content:'# '+name+'\n\n这是用来核对手机布局的示例内容。\n\n'+('阅读段落，不改变保存规则。\n\n'.repeat(20)),signature:'portrait-'+n,modified:1793836800000-n}]))
const seed={version:1,documents,drafts:{}},recent=portraitNames.filter(n=>!n.includes('/')).slice(0,3).map(relativePath=>({rootId:'local',relativePath}))
await writeFile(out+'/seed.json',JSON.stringify({seed,recent},null,2))
const browser=await chromium.launch({channel:'chrome',headless:true}),report={sourceCommit:'7642eb8daa5c23269a37c974862ff3543935082b',scope:'Actual completed 1002050 frontend in a fresh browser context, not a native phone or IME test.',screens:[],source:[]}
try{
 for(const file of ['src/mobile/MobileApp.vue','src/mobile/LibrarySearch.vue','src/mobile/MobileSettings.vue','src/mobile/mobile.scss']){const bytes=await readFile(file);report.source.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});await writeFile(out+'/'+file.split('/').pop()+'.before',bytes)}
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'})
 await context.addInitScript(({seed,recent})=>{localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify(seed));localStorage.setItem('longedit-mobile-recent-v1',JSON.stringify(recent))},{seed,recent})
 const page=await context.newPage();await page.goto('http://127.0.0.1:9012/mobile.html');await page.locator('.file-row').first().waitFor()
 async function screen(name){await page.screenshot({path:out+'/before-'+name+'.png'});report.screens.push({name,heading:await page.locator('h1').allTextContents(),firstFile:await page.locator('.file-row').count()?await page.locator('.file-row').first().boundingBox():null,continue:await page.locator('.continue-card').count()?await page.locator('.continue-card').boundingBox():null,viewport:page.viewportSize()})}
 await screen('library');await page.getByRole('button',{name:'搜索',exact:true}).tap();await screen('search');await page.getByRole('button',{name:'设置',exact:true}).tap();await screen('settings');await page.getByRole('button',{name:'资料',exact:true}).tap();await page.getByRole('button',{name:'添加资料',exact:true}).tap();await screen('add');await page.getByRole('button',{name:'新建笔记',exact:true}).tap();await page.getByLabel('笔记名称',{exact:true}).fill('竖屏操作核对');await screen('new-note');await page.setViewportSize({width:360,height:400});await screen('new-note-short');await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await page.locator('.file-row').filter({hasText:portraitNames[0]}).tap();await page.locator('.editor-footer').waitFor();await screen('reader');await page.getByRole('button',{name:'编辑',exact:true}).tap();await screen('editor')
 report.passed=true
}catch(error){report.failure=String(error.stack||error);throw error}finally{await browser.close();await writeFile(out+'/baseline.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify({out,screens:report.screens.length,firstFile:report.screens[0].firstFile}))
