import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {renderMobileDesignComparison} from './mobile-design-comparison.mjs'

const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output=`docs/evidence/mobile-0.1.0/pdf-navigation-alignment-browser-${Date.now()}`
await mkdir(output,{recursive:true})
const bytes=await readFile('scripts/fixtures/mobile-pdf-navigation-design.pdf')
const sha=b=>createHash('sha256').update(b).digest('hex')
const report={kind:'mobile-pdf-navigation-visual-alignment',nativeAndroidTest:false,checks:[],errors:[],externalRequests:[],sourceSha256:sha(bytes),referenceSha256:sha(await readFile('docs/design/mobile-0.1.0/pdf-navigation-v1.png'))}
const browser=await chromium.launch({channel:'chrome',headless:true})
let page,appTop=26
const button=name=>page.getByRole('button',{name,exact:true})
const rendered=()=>page.waitForFunction(()=>!document.querySelector('.pdf-render-status')&&document.querySelector('.textLayer span'))
const capture=async name=>{await page.waitForTimeout(300);await page.screenshot({path:output+'/'+name+'.png',clip:{x:0,y:appTop,width:390,height:844}})}
try {
  const context=await browser.newContext({viewport:{width:390,height:870},isMobile:true,hasTouch:true})
  context.on('request',r=>{if(!/^https?:\/\/127\.0\.0\.1:\d+\//.test(r.url())&&!/^(blob:|data:)/.test(r.url()))report.externalRequests.push(r.url())})
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)))
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL||'http://127.0.0.1:9012/mobile.html')
  await page.getByLabel('选择 PDF 文件',{exact:true}).setInputFiles({name:'阅读导航.pdf',mimeType:'application/pdf',buffer:bytes})
  await rendered();appTop=Math.ceil((await page.locator('.mobile-pdf').boundingBox()).y)
  assert.ok(appTop>0&&appTop<40);await page.setViewportSize({width:390,height:844+appTop});report.previewOffset=appTop
  await page.locator('.pdf-page-button').tap();await page.getByLabel(/前往第几页/).fill('3');await button('前往这一页').tap();await rendered()
  await button('目录与页面').tap();await button('安静阅读').waitFor()
  assert.equal(await page.locator('.pdf-outline-link').count(),6)
  assert.equal(await page.locator('.document-heading h1').textContent(),'阅读导航.pdf')
  assert.ok((await page.locator('.document-heading h1').getAttribute('title')).includes('-导入-'))
  const geometry=await page.evaluate(top=>{
    const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y-top,width:r.width,height:r.height}}
    const css=(s,p)=>getComputedStyle(document.querySelector(s)).getPropertyValue(p)
    const underline=getComputedStyle(document.querySelector('.pdf-navigation-tabs [aria-pressed=true]>span'),'::after')
    return {panel:box('.pdf-navigation'),title:box('.pdf-navigation-heading h2'),close:box('.pdf-navigation-heading .button'),hint:box('.pdf-navigation-hint'),footer:box('.pdf-navigation-footer'),current:box('.pdf-navigation-footer p'),continue:box('.pdf-navigation-footer>.button'),body:box('.pdf-navigation-body'),tab:box('.pdf-navigation-tabs button'),underlineWidth:parseFloat(underline.width),titleSize:css('.pdf-navigation-heading h2','font-size'),titleColor:css('.pdf-navigation-heading h2','color'),ink:css('.pdf-navigation','color'),rootWeight:css('.pdf-outline .is-root>.pdf-outline-link','font-weight'),childWeight:css('.pdf-outline li:not(.is-root)>.pdf-outline-link','font-weight'),rowSize:css('.pdf-outline-link','font-size'),continueSize:css('.pdf-navigation-footer>.button','font-size'),rows:Array.from(document.querySelectorAll('.pdf-outline-link')).map(e=>({text:e.innerText,rect:{y:e.getBoundingClientRect().y-top,height:e.getBoundingClientRect().height}}))}
  },appTop)
  report.geometry=geometry
  // Targets transcribed from the unchanged 853×1844 image, normalized to 390×844.
  // Tolerances allow native fonts and >=44px touch targets; they do not compare a design to its own CSS.
  assert.ok(Math.abs(geometry.panel.y-106)<=3)
  assert.equal(geometry.titleSize,'24px');assert.equal(geometry.titleColor,geometry.ink)
  assert.ok(geometry.close.height>=44);assert.ok(geometry.close.width<=125)
  assert.ok(Math.abs(geometry.hint.x-16)<=1);assert.equal(geometry.hint.width,358)
  assert.ok(Math.abs(geometry.hint.y-229)<=6)
  assert.ok(geometry.hint.height>=64&&geometry.hint.height<=76)
  assert.ok(geometry.underlineWidth>=50&&geometry.underlineWidth<90&&geometry.underlineWidth<geometry.tab.width)
  assert.equal(geometry.rowSize,'16px');assert.ok(Number(geometry.rootWeight)>Number(geometry.childWeight))
  assert.ok(geometry.rows.every(r=>r.rect.height>=48&&r.rect.height<=52))
  assert.ok(Math.abs(geometry.current.y-713)<=12);assert.ok(Math.abs(geometry.continue.y-762)<=10)
  assert.equal(geometry.continueSize,'16px');assert.equal(geometry.continue.width,358)
  assert.equal(await page.locator('.pdf-outline-guide.is-elbow').count(),3)
  assert.equal(await page.locator('.pdf-outline-guide.is-elbow.is-last').count(),2)
  assert.equal(await page.locator('.pdf-outline-guide:not([aria-hidden=true])').count(),0)
  assert.equal(await page.locator('.pdf-outline .is-root>.icon-button').count(),2)
  await capture('390-navigation-light')
  await renderMobileDesignComparison(browser,output,{reference:'docs/design/mobile-0.1.0/pdf-navigation-v1.png',actual:'390-navigation-light.png',title:'Long编辑 · 目录导航实页复核',footer:'左：原始853×1844设计图，未修改。右：390×844实际应用，载入独立六条目录PDF，第三页；不替换标题、目录或页面。保留44px关闭按钮触控范围及真实PDF正文。本批新增书签第三入口，标签按三栏布局；其余目录基础尺寸沿用原图。'})
  report.checks.push('Unchanged reference and real six-entry PDF at page 3: panel top, 24px ink title, sage close pill, short tab indicator, 16px margins, 16px hierarchy and bounded footer match measured design targets')
  const guideColor=()=>page.locator('.pdf-outline-guide').first().evaluate(e=>getComputedStyle(e).borderLeftColor)
  assert.equal(await guideColor(),'rgb(199, 210, 197)')
  await button('切换深色').tap();assert.equal(await guideColor(),'rgb(100, 117, 100)');await capture('390-navigation-dark');await button('切换浅色').tap()
  await button('收起章节：阅读从这里开始').tap();assert.equal(await button('安静阅读').count(),0);await capture('390-navigation-collapsed');await button('展开章节：阅读从这里开始').tap()
  await button('页面').tap();await page.waitForFunction(()=>document.querySelectorAll('.pdf-page-preview canvas').length===6&&Array.from(document.querySelectorAll('.pdf-page-preview canvas')).every(c=>c.style.display!=='none'&&c.width>1))
  await capture('390-pages');await button('目录').tap();await button('关闭导航').tap();assert.ok(await button('目录与页面').evaluate(e=>e===document.activeElement))
  report.checks.push('Light/dark and actual thumbnail views captured; root disclosure has >=44px touch area, leaves have no false disclosure, decorative connectors are hidden from accessibility and closing restores launcher focus')
  for(const width of [320,360,430]){
    await page.setViewportSize({width,height:844+appTop});await button('目录与页面').tap()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    assert.ok((await page.locator('.pdf-navigation-body').boundingBox()).height>300)
    await page.screenshot({path:output+`/${width}-navigation.png`,fullPage:true});await button('关闭导航').tap()
  }
  await page.setViewportSize({width:320,height:346});await page.locator('html').evaluate(e=>e.style.fontSize='200%');await button('目录与页面').tap()
  assert.ok((await page.locator('.pdf-navigation-body').boundingBox()).height>=40)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await button('带着想法返回').tap();await rendered();await button('目录与页面').tap();await page.screenshot({path:output+'/320-short-large.png',fullPage:true});await button('关闭导航').tap()
  report.checks.push('320/360/430px layouts and 320×346 at 200% font retain working chapter/close actions, >=40px scrollable short-screen body and no horizontal overflow')
  const source=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).attachments).find(a=>a.base64).base64)
  assert.equal(sha(Buffer.from(source,'base64')),sha(bytes));assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[])
  report.checks.push('Visual checks use actual offline PDF.js rendering and exact source bytes, with no external requests or page errors')
  report.passed=true
} catch(e) {
  report.passed=false;report.failure=String(e?.stack||e);process.exitCode=1
  if(page)await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{})
} finally {await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(output)}
