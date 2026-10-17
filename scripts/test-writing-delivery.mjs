import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1114-delivery-core';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage()
const report={evidenceLevel:'browser-DOM-static-export-utility-not-native-installed',checks:[]}
const remote=[];page.on('request',request=>{if(request.url().startsWith('https://example.invalid/'))remote.push(request.url())})
try{
 await page.goto('http://127.0.0.1:9022/')
 const value=await page.evaluate(async()=>{
  const {deliveryDocument}=await import('/src/utils/writingDelivery.ts'),{DEFAULT_DISPLAY_PREFERENCES}=await import('/src/config/displayPreferences.ts')
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
  return deliveryDocument('中文 <方案>',`<h1>用户尚未保存的方案</h1><p>原有中文不会丢失</p><img src="../共享%20图/测试.png" srcset="blob:temporary" onerror="alert(1)"><img src="https://example.invalid/a.png"><script>window.bad=true</script><iframe src="file:///private"></iframe><a href="javascript:alert(1)">恶意链接</a><input type="checkbox" checked><table><tr><td rowspan="2">表格</td></tr></table>`,{images:[{source:'../共享%20图/测试.png',dataUri:png}],warnings:[]},{...DEFAULT_DISPLAY_PREFERENCES,documentFont:'custom',documentCustomFont:'字体";}</style><script>bad</script>'})
 })
 assert.ok(value.document.includes('用户尚未保存的方案'));assert.ok(value.document.includes('☑'));assert.ok(value.document.includes('rowspan="2"'))
 assert.ok(!value.document.includes('blob:temporary'));assert.ok(!value.document.includes('onerror='));assert.ok(!value.document.includes('<script>'));assert.ok(!value.document.includes('<iframe'));assert.ok(!value.document.includes('javascript:'))
 report.checks.push('Static semantic content retained; handlers, temporary srcset, active embeds and unsafe URLs excluded')
 await fs.writeFile(output+'/portable.html',value.document)
 await page.goto(new URL('../'+output+'/portable.html',import.meta.url).href)
 await page.waitForFunction(()=>document.images[0]?.complete&&document.images[0].naturalWidth>0)
 assert.equal(await page.locator('img').count(),1);assert.ok(await page.locator('body').innerText().then(t=>t.includes('https://example.invalid/a.png')))
 assert.equal(await page.evaluate(()=>window.bad),undefined)
 assert.deepEqual(remote,[],'export preparation and standalone reopening never download remote image URLs')
 await page.screenshot({path:output+'/standalone-reopened.png',fullPage:true})
 await page.pdf({path:output+'/browser-layout-only.pdf',format:'A4'})
 report.checks.push('Standalone file reopened outside app/Vite with embedded local image and no executable script; browser print layout generated (not native installed PDF proof)')
 report.warnings=value.warnings;report.status='passed'
}catch(error){report.status='failed';report.failure=String(error.stack||error);throw error}
finally{await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
