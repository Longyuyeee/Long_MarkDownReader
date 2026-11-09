import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = `docs/evidence/mobile-0.1.0/creation-browser-${Date.now()}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'new-note-admission-tasks', nativeAndroidTest: false, checks: [], errors: [], externalRequests: [] }
let page
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1') || '{"drafts":{},"documents":{}}'))
const identity = name => JSON.stringify(['local', name + '.md'])
async function form(name) { await page.getByRole('button', { name: '新建笔记', exact: true }).last().tap(); await page.getByLabel('笔记名称', { exact: true }).fill(name) }
async function saveAndBack(content) {
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill(content)
  await page.getByRole('button', { name: '保存', exact: true }).tap()
  await page.getByText('已保存到文件', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '返回资料库', exact: true }).tap()
  await page.locator('.new-note-fab').waitFor()
}
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  await context.addInitScript(() => {
    window.__creationFrames = 0
    new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) window.__creationFrames += Number(node.matches('iframe')) + node.querySelectorAll('iframe').length }).observe(document, { childList: true, subtree: true })
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (window.__rejectNewDraft && key === 'longedit-mobile-preview-v1' && Object.values(JSON.parse(value).drafts).some(draft => draft.expectedSignature === null)) throw new DOMException('模拟草稿存储不足', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.getByRole('heading', { name: '从一条笔记开始', exact: true }).waitFor()
  await form('创建失败后重试')
  await page.evaluate(() => { window.__rejectNewDraft = true })
  await page.getByRole('button', { name: '开始记录', exact: true }).tap()
  await page.getByRole('dialog').getByRole('alert').getByText(/本机存储空间不足/).waitFor()
  assert.equal(await page.getByLabel('笔记名称', { exact: true }).inputValue(), '创建失败后重试')
  assert.equal(await page.locator('.reader-header').count(), 0); assert.equal(Object.keys((await state()).drafts).length, 0)
  await page.screenshot({ path: path.join(output, '360-draft-failure.png') })
  await page.evaluate(() => { window.__rejectNewDraft = false })
  await page.getByRole('button', { name: '开始记录', exact: true }).tap()
  await page.getByText('草稿已保护', { exact: true }).waitFor()
  await saveAndBack('重试后的完整中文😀\n')
  assert.equal((await state()).documents[identity('创建失败后重试')].content, '重试后的完整中文😀\n')
  report.checks.push('A failed initial private draft keeps the creation form and name without activating a phantom document; retry creates and explicitly saves the complete note')

  await form('一次提交')
  await page.locator('form').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).waitFor()
  assert.equal(Object.keys((await state()).drafts).filter(key => key === identity('一次提交')).length, 1)
  await saveAndBack('只创建一次\n')
  assert.equal(await page.evaluate(() => window.__creationFrames), 0, 'Creating in edit mode must never mount an intermediate reader iframe under the inert sheet')
  assert.equal(Object.values((await state()).documents).filter(document => document.relativePath === '一次提交.md').length, 1)
  report.checks.push('Two same-task form submissions create one protected draft and one final file without resetting the editor')

  await form('一次提交')
  await page.getByRole('button', { name: '开始记录', exact: true }).tap()
  await page.getByRole('dialog').getByRole('alert').getByText(/已经有这个名字/).waitFor()
  assert.equal((await state()).documents[identity('一次提交')].content, '只创建一次\n')
  await page.getByLabel('笔记名称', { exact: true }).fill('取消后继续')
  await page.getByRole('button', { name: '关闭面板', exact: true }).tap()
  await page.locator('.new-note-fab').tap()
  assert.equal(await page.getByLabel('笔记名称', { exact: true }).inputValue(), '取消后继续')
  await page.getByRole('button', { name: '关闭面板', exact: true }).tap()
  report.checks.push('An existing visible name is rejected without changing it; dismissing and reopening the sheet preserves its unsent name')

  await page.evaluate(() => {
    const key='longedit-mobile-preview-v1', data=JSON.parse(localStorage.getItem(key))
    for(let i=0;i<1001;i++){const relativePath=`Z${String(i).padStart(4,'0')}.md`;data.documents[JSON.stringify(['local',relativePath])]={rootId:'local',relativePath,content:'原始资料'+i,signature:'original-'+i,modified:1}}
    localStorage.setItem(key,JSON.stringify(data))
  })
  await page.getByRole('button', { name: '刷新文件列表', exact: true }).tap()
  await page.getByText('此目录先显示前 1,000 项，其他资料尚未加载。', { exact: true }).waitFor()
  await form('Z1000')
  await page.getByRole('button', { name: '开始记录', exact: true }).tap()
  await page.getByRole('dialog').getByRole('alert').getByText(/已经有这个名字/).waitFor()
  assert.equal((await state()).documents[identity('Z1000')].content, '原始资料1000')
  assert.equal((await state()).drafts[identity('Z1000')], undefined)
  await page.setViewportSize({ width: 360, height: 800 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  report.accessibility = await page.evaluate(async()=>{const r=await axe.run(document,{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {violations:r.violations.map(({id})=>id),incomplete:r.incomplete.map(({id})=>id)}})
  assert.deepEqual(report.accessibility.violations, []); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth), false)
  await page.screenshot({ path: path.join(output, '360-name-conflict-200.png') })
  report.checks.push('A name beyond the truncated directory snapshot is checked against actual storage and rejected without a draft; the error sheet remains usable at 200% text')
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []); report.passed = true
} catch(error) { report.failure=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{}) }
finally {await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({output,checks:report.checks,passed:report.passed,failure:report.failure},null,2))}
