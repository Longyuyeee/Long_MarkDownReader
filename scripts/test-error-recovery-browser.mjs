import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v110-error-recovery'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined, headless: true })
const checks = [], unexpected = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => { if (!/演示|路径不存在/.test(error.message)) unexpected.push(error.message) })
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="library-document-preview"]').disabled)
  await page.addScriptTag({ url: '/app-recovery.js' })
  await page.evaluate(async () => {
    const { showRuntimeErrorNotice } = await import('/src/services/runtimeErrorNotice.ts')
    window.__longeditRecovery.setRuntimeHandler(error => showRuntimeErrorNotice(error,
      () => { void window.workflowAudit.router.push({ name: 'Settings' }) },
      () => { void window.workflowAudit.router.push({ name: 'LibraryMode' }) }))
    window.__longeditRecovery.markReady()
    window.preservedEditor = document.querySelector('.vditor-wysiwyg [contenteditable="true"]')
  })
  const editor = page.locator('.vditor-wysiwyg [contenteditable="true"]').first()
  await editor.click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' recovery draft')
  await page.waitForFunction(() => window.workflowAudit.store.tabs[0].content.includes('recovery draft'))
  const draft = await page.evaluate(() => window.workflowAudit.store.tabs[0].content)
  for (const theme of ['white', 'dark']) {
    await page.evaluate(theme => { window.workflowAudit.store.theme = theme; void Promise.reject(`路径不存在或不可访问：系统找不到指定的文件。(os error 2) ${theme}`) }, theme)
    const notice = page.locator('#runtime-error-notice')
    await notice.waitFor()
    assert.equal(await page.evaluate(() => document.querySelector('.vditor-wysiwyg [contenteditable="true"]') === window.preservedEditor), true)
    assert.equal(await page.evaluate(() => window.workflowAudit.store.tabs[0].content), draft)
    assert.equal(await page.evaluate(() => window.workflowAudit.store.tabs[0].isDirty), true)
    const box = await notice.boundingBox()
    assert.ok(box.width <= 380 && box.height <= 287, 'Operation error stays in a small corner notice')
    assert.equal(await page.locator('#crash-screen, #app-startup-screen').count(), 0)
    await page.screenshot({ path: `${output}/${theme}-operation.png`, animations: 'disabled' })
    await notice.getByRole('button', { name: '关闭提示' }).click()
    await page.evaluate(theme => { for (let i = 0; i < 12; i++) void Promise.reject(`路径不存在或不可访问：系统找不到指定的文件。(os error 2) ${theme}`) }, theme)
    await page.waitForTimeout(100)
    assert.equal(await notice.count(), 0, 'Dismissed repeated errors do not immediately reopen the notice')
  }
  await editor.click(); await page.keyboard.type(' continue editing')
  await page.waitForFunction(() => window.workflowAudit.store.tabs[0].content.includes('continue editing'))
  checks.push('Real rejected promises in light/dark keep the mounted editor, dirty draft and continued editing; notices are bounded, dismissible and deduplicate repeats')

  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { error: new Error('演示普通脚本错误'), message: '演示普通脚本错误', cancelable: true })))
  await page.locator('#runtime-error-notice').waitFor()
  await page.locator('#runtime-error-notice').getByRole('button', { name: '管理知识库' }).click()
  await page.waitForFunction(() => window.workflowAudit.router.currentRoute.value.name === 'Settings')
  assert.equal(await page.getByRole('navigation', { name: '主导航' }).getByRole('link').count(), 4)
  checks.push('Uncaught script errors still offer working library settings and global navigation')

  await page.evaluate(async () => {
    const { h } = await import('/node_modules/.vite/deps/vue.js')
    const store = window.workflowAudit.store
    const Widget = { props: ['broken'], render() { if (this.broken) throw Error('演示小组件渲染失败'); return h('span', '局部组件正常') } }
    window.workflowAudit.router.addRoute({ path: '/error-demo', name: 'ErrorDemo', component: {
      data: () => ({ broken: false, childBroken: false }),
      render() {
        if (this.broken) throw Error('演示页面渲染失败')
        return h('section', {}, [
          h('input', { 'aria-label': '演示草稿', value: store.tabs[0].content, onInput: event => { store.tabs[0].content = event.target.value } }),
          h('button', { onClick: async () => { throw Error('演示异步操作失败') } }, '触发操作错误'),
          h('button', { onClick: () => { this.broken = true } }, '触发渲染错误'),
          h('button', { onClick: () => { this.childBroken = true } }, '触发小组件错误'),
          h(Widget, { broken: this.childBroken }),
        ])
      },
    } })
    await window.workflowAudit.router.push({ name: 'ErrorDemo' })
  })
  const demo = page.getByLabel('演示草稿')
  await demo.fill('unsaved demo draft')
  await page.getByRole('button', { name: '触发操作错误' }).click()
  await page.locator('#runtime-error-notice').waitFor()
  assert.equal(await demo.inputValue(), 'unsaved demo draft')
  assert.equal(await page.locator('.workspace-error-state').count(), 0)
  await page.locator('#runtime-error-notice').getByRole('button', { name: '关闭提示' }).click()
  await page.getByRole('button', { name: '触发小组件错误' }).click()
  await page.locator('#runtime-error-notice').waitFor()
  assert.equal(await demo.inputValue(), 'unsaved demo draft')
  assert.equal(await page.locator('.workspace-error-state').count(), 0)
  await page.locator('#runtime-error-notice').getByRole('button', { name: '关闭提示' }).click()
  await page.getByRole('button', { name: '触发渲染错误' }).click()
  await page.locator('.workspace-error-state').waitFor()
  assert.equal(await page.getByRole('navigation', { name: '主导航' }).getByRole('link').count(), 4)
  assert.equal(await page.evaluate(() => window.workflowAudit.store.tabs[0].content), 'unsaved demo draft')
  await page.screenshot({ path: `${output}/page-recovery.png`, animations: 'disabled' })
  await page.getByRole('button', { name: '重试此页面' }).click()
  assert.equal(await demo.inputValue(), 'unsaved demo draft')
  await page.getByRole('button', { name: '触发渲染错误' }).click()
  await page.getByRole('button', { name: '返回工作台' }).click()
  await page.locator('.workspace-home').waitFor()
  checks.push('Vue event and subwidget errors keep the page alive; page-root render errors are contained to the route, retain shared drafts, and recover by retry or navigation')

  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop limit exceeded', cancelable: true }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.', cancelable: true }))
  })
  assert.equal(await page.locator('#runtime-error-notice').count(), 0)
  checks.push('Recoverable ResizeObserver notifications still stay silent')
  await page.evaluate(() => { document.querySelector('#app .app-container').remove(); void Promise.reject('演示根界面损坏') })
  await page.getByRole('heading', { name: '界面暂时无法打开' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '重新载入界面' }).isVisible(), true)
  assert.equal(await page.evaluate(() => window.workflowAudit.store.tabs[0].content), 'unsaved demo draft')
  checks.push('A previously ready shell that actually disappears gets a visible recovery card while shared draft data is retained')

  const startup = await browser.newPage({ viewport: { width: 900, height: 620 } })
  await startup.route('**/src/main.ts*', route => route.abort('failed'))
  await startup.goto('http://127.0.0.1:9000/')
  await startup.getByRole('heading', { name: '界面暂时无法打开' }).waitFor()
  assert.equal(await startup.getByRole('button', { name: '重新载入界面' }).isVisible(), true)
  assert.equal(await startup.getByRole('button', { name: '打开资料库设置' }).isVisible(), true)
  assert.equal(await startup.locator('#crash-screen').count(), 0)
  await startup.screenshot({ path: `${output}/startup-recovery.png`, animations: 'disabled' })
  checks.push('Actual entry-module failure shows a readable startup recovery card with reload/settings actions instead of a black debug overlay')
  assert.deepEqual(unexpected, [])
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ checks, unexpected, scope: 'Actual App/LibraryMode and entry HTML; mocked native IPC; real promise rejection, Vue event/render errors and blocked main-module loading.' }, null, 2) + '\n')
  console.log(JSON.stringify({ checks, unexpected }))
} finally { await browser.close() }
