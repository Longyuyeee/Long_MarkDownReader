import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output=`docs/evidence/mobile-0.1.0/incoming-baseline-${Date.now()}`
await mkdir(output,{recursive:true});await writeFile(output+'/.gitignore','*\n')
const browser=await chromium.launch({channel:'chrome',headless:true}),report={nativeAndroidTest:false,observations:{}}
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
 await context.addInitScript(()=>{if(window!==window.top)return;const key=JSON.stringify(['local','正在写.md']);localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify({version:1,documents:{[key]:{rootId:'local',relativePath:'正在写.md',content:'原文件\r\n',signature:'old',modified:1}},drafts:{}}))})
 const page=await context.newPage();await page.goto('http://127.0.0.1:9012/mobile.html');await page.locator('.file-row').filter({hasText:'正在写.md'}).tap();await page.getByRole('button',{name:'编辑',exact:true}).tap();await page.getByRole('textbox',{name:'笔记正文',exact:true}).fill('保留编辑现场\n')
 await page.evaluate(async()=>{const d=JSON.parse(localStorage.getItem('longedit-mobile-preview-v1'));d.fileImports={};for(let n=1;n<=2;n++){const id=crypto.randomUUID(),content=`第${n}份完整内容`,bytes=new TextEncoder().encode(content),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');d.fileImports[id]={id,name:`分享${n}.txt`,created:n,bytes:bytes.length,status:'ready',content,digest,readable:true,localPath:null,error:'',incoming:true,source:'share-text'}}localStorage.setItem('longedit-mobile-preview-v1',JSON.stringify(d));window.dispatchEvent(new Event('longedit-mobile-incoming'))})
 await page.getByRole('button',{name:'查看收到的内容',exact:true}).waitFor();await page.screenshot({path:output+'/editor.png'});await page.getByRole('button',{name:'查看收到的内容',exact:true}).tap();await page.getByLabel('待导入文字（只读）',{exact:true}).waitFor();await page.screenshot({path:output+'/auto-newest.png'})
 report.observations.latestSelectedWithoutChoice=await page.getByRole('heading',{name:'分享2.txt',exact:true}).count()===1
 report.observations.editorUnmountedForInspection=await page.locator('.cm-editor').count()===0
 await page.getByRole('button',{name:'关闭面板',exact:true}).tap();report.observations.returnedToLibraryInsteadOfEditor=await page.getByRole('heading',{name:'我的资料',exact:true}).count()===1;await page.screenshot({path:output+'/return.png'})
 assert.ok(Object.values(report.observations).every(Boolean));report.captureCompleted=true
}catch(e){report.failure=String(e.stack||e);process.exitCode=1}finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({output,...report}))}
