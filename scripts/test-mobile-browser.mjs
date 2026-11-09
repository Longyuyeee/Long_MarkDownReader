import { readMobileDocument } from './mobile-document-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.LONGEDIT_MOBILE_EVIDENCE_DIRECTORY || `docs/evidence/mobile-0.1.0/browser-${Date.now()}`
const previewUrl = process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9010/mobile.html'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.LONGEDIT_BROWSER_CHANNEL || 'chrome', headless: true })
const report = { kind: 'browser-preview-with-local-storage', nativeAndroidTest: false, checks: [], errors: [] }
let page
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  page = await context.newPage()
  page.on('pageerror', error => report.errors.push(String(error)))
  await page.goto(previewUrl)
  await page.getByRole('heading', { name: '从一条笔记开始' }).waitFor()
  await page.locator('.library-selector').tap()
  await page.getByRole('dialog', { name: '选择资料库', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'dialog')
  assert.equal(await page.locator('.mobile-workspace').evaluate(element => element.inert), true)
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  report.checks.push('Library sheet takes focus, makes the background inert, and closes with Escape')
  await page.screenshot({ path: path.join(output, '360-empty.png'), fullPage: true })
  await page.getByRole('button', { name: '新建笔记', exact: true }).first().tap()
  await page.getByLabel('笔记名称').fill('手机上的阅读笔记')
  await page.getByRole('button', { name: '开始记录', exact: true }).tap()
  const original = '# 给思考留一点空间\n\n打开资料，接着上一次的阅读。\n\n## 今天的想法\n\n- 把重要的内容留在身边\n- 写下自己的理解\n\n> 一点一点，让思路更清楚。'
  await page.getByLabel('笔记正文').fill(original)
  await page.getByRole('button', { name: '保存', exact: true }).tap()
  await page.getByText('已保存到文件', { exact: true }).first().waitFor()
  assert.equal(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).documents)[0].content), original)
  report.checks.push('360px touch: create and explicitly save a Unicode Markdown note')
  await readMobileDocument(page)
  await page.frameLocator('iframe[title="文档阅读"]').getByRole('heading', { name: '给思考留一点空间' }).waitFor()
  await page.screenshot({ path: path.join(output, '360-reader.png'), fullPage: true })
  await page.getByRole('button', { name: '编辑', exact: true }).tap()
  const draft = original + '\n\n这一句还没有保存，稍后接着写。'
  await page.getByLabel('笔记正文').fill(draft)
  await page.getByText('草稿已保护', { exact: true }).waitFor()
  await page.screenshot({ path: path.join(output, '360-editor.png'), fullPage: true })
  await page.getByRole('button', { name: '返回资料库', exact: true }).tap()
  await page.locator('.continue-card').waitFor()
  await page.waitForFunction(() => document.activeElement?.classList.contains('file-row'))
  assert.equal(await page.getByRole('button', { name: /手机上的阅读笔记.md/ }).evaluate(element => element === document.activeElement), true)
  await page.screenshot({ path: path.join(output, '360-library.png'), fullPage: true })
  const state = await context.storageState()
  const restored = await browser.newContext({ storageState: state, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
  page = await restored.newPage()
  page.on('pageerror', error => report.errors.push(String(error)))
  await page.goto(previewUrl)
  await page.locator('.continue-card').tap()
  await page.getByRole('button', { name: '继续这份草稿' }).waitFor()
  await page.screenshot({ path: path.join(output, '412-recovery.png'), fullPage: true })
  await page.getByRole('button', { name: '先阅读文件', exact: true }).tap()
  await page.frameLocator('iframe[title="文档阅读"]').getByRole('heading', { name: '给思考留一点空间' }).waitFor()
  await page.getByRole('button', { name: '继续草稿', exact: true }).tap()
  await page.getByRole('button', { name: '继续这份草稿' }).tap()
  assert.equal((await page.getByLabel('笔记正文').locator('.cm-line').allTextContents()).join('\n'), draft)
  report.checks.push('Independent browser context restores unsaved draft without modifying original')
  await page.getByRole('button', { name: '保存', exact: true }).tap()
  await page.getByText('已保存到文件', { exact: true }).first().waitFor()
  await page.getByLabel('笔记正文').fill(draft + '\n\n我的后续修改')
  await page.evaluate(() => {
    const key = 'longedit-mobile-preview-v1', data = JSON.parse(localStorage.getItem(key))
    const doc = Object.values(data.documents)[0]
    doc.content = '外部新版本'; doc.signature = 'external-change'
    localStorage.setItem(key, JSON.stringify(data))
  })
  await page.getByRole('button', { name: '保存', exact: true }).tap()
  await page.getByRole('button', { name: '存入手机资料库', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.assistive-status')?.textContent !== '正在保存…')
  await page.getByRole('button', { name: '存入手机资料库', exact: true }).tap()
  await page.getByText('副本已存入手机资料库，原文和原草稿仍保留。', { exact: true }).waitFor()
  const docs = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).documents))
  assert.equal(docs.find(doc => doc.relativePath === '手机上的阅读笔记.md').content, '外部新版本')
  assert.ok(docs.some(doc => doc.content.endsWith('我的后续修改')))
  report.checks.push('External source conflict preserves both versions and saves a distinct copy')
  await page.getByRole('button', { name: '返回资料库', exact: true }).tap()
  await page.getByLabel('按文件名查找').fill('不存在的资料')
  await page.getByRole('heading', { name: '没有找到这个名字' }).waitFor()
  await page.getByRole('button', { name: '搜索', exact: true }).tap()
  await page.getByLabel('查找资料内容').fill('不存在的资料')
  await page.getByRole('heading',{name:'没有找到匹配',exact:true}).waitFor()
  await page.getByRole('button', { name: '设置', exact: true }).tap()
  await page.locator('[data-focus-key="settings-appearance"]').tap(); await page.locator('[data-focus-key="settings-theme"]').tap(); await page.getByRole('dialog',{name:'主题',exact:true}).getByRole('button',{name:'深色',exact:true}).tap(); await page.getByRole('button',{name:'返回设置',exact:true}).tap()
  await page.screenshot({ path: path.join(output, '412-settings-dark.png'), fullPage: true })
  report.checks.push('412px: library name filter and full-text empty states, then dark appearance')
  await page.setViewportSize({ width: 800, height: 1280 })
  await page.getByRole('button', { name: '资料', exact: true }).tap()
  await page.screenshot({ path: path.join(output, '800-library-dark.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  report.checks.push('800px: no horizontal document overflow')
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  report.passed = false; report.failure = String(error)
  if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await browser.close()
  console.log(JSON.stringify({ output, ...report }, null, 2))
}
