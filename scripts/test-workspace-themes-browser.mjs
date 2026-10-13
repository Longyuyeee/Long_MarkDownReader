import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'

const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v110-modern-themes'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined, headless: true })
const errors = [], surfaces = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 880 } })
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.evaluate(() => {
    const tab = window.workflowAudit.store.tabs[0]
    tab.content = '# 项目方案\n\n把零散资料整理成清晰的思路，让阅读、记录和继续工作更顺手。\n\n> 常用操作就在正文附近，参考资料按需打开。\n\n## 本周重点\n\n- [ ] 整理用户反馈\n- [x] 汇总会议记录\n\n| 事项 | 进展 |\n| --- | --- |\n| 界面体验 | 细化主题与文件显示 |\n| 知识整理 | 连接笔记和参考资料 |\n'
    window.workflowAudit.disk.set(tab.path, tab.content)
  })
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  await page.getByTestId('library-document-preview').waitFor()
  await page.waitForFunction(() => !document.querySelector('[data-testid="library-document-preview"]').disabled)
  const preferences = await page.evaluate(() => {
    const store = window.workflowAudit.store
    store.displayPreferences = { ...store.displayPreferences, documentStyle: 'editorial', fileDensity: 'spacious', fileRowStyle: 'cards' }
    return JSON.parse(JSON.stringify(store.displayPreferences))
  })
  const presets = ['forest-green', 'tech-blue', 'ocean-glass', 'cream-airy', 'professional-light', 'sharp-business', 'professional-dark', 'high-contrast']
  for (const id of presets) {
    await page.evaluate(id => window.workflowAudit.store.applyThemePreset(id), id)
    await page.waitForFunction(id => {
      const preset = window.workflowAudit.presets.find(item => item.id === id)
      return document.body.dataset.theme === preset.theme && document.body.dataset.style === preset.style && !document.querySelector('[data-testid="library-document-preview"]').disabled
    }, id)
    await page.waitForTimeout(300)
    assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.stringify(window.workflowAudit.store.displayPreferences))), preferences, `${id}: retain document and file preferences`)
    const surface = await page.evaluate(() => {
      const css = selector => getComputedStyle(document.querySelector(selector))
      const counts = document.querySelector('.knowledge-index-strip > small')
      return {
        style: document.body.dataset.style, theme: document.body.dataset.theme,
        ground: css('.library-mode').background, rail: css('.app-navigation').background,
        sidebar: css('.sidebar').background, radius: css('.editor-main').borderRadius,
        tools: css('.vditor-toolbar').background, shadow: css('.editor-main').boxShadow,
        selectedIcon: css('.app-navigation a.active .navigation-icon').backgroundColor,
        countsClipped: counts.scrollWidth > counts.clientWidth,
      }
    })
    assert.equal(surface.countsClipped, false, `${id}: default sidebar statistics remain readable`)
    surfaces.push({ id, ...surface })
  }
  assert.equal(new Set(surfaces.slice(0, 6).map(item => `${item.ground}|${item.sidebar}|${item.radius}|${item.shadow}|${item.tools}`)).size, 6)
  await page.evaluate(() => {
    const store = window.workflowAudit.store
    store.displayPreferences = { ...store.displayPreferences, documentStyle: 'auto', fileDensity: 'auto', fileRowStyle: 'auto' }
  })
  for (const id of presets) {
    await page.evaluate(id => window.workflowAudit.store.applyThemePreset(id), id)
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${output}/${id}.png`, animations: 'disabled' })
  }
  // Use the production settings view inside the same application shell.
  await page.evaluate(async () => {
    const { default: SettingsView } = await import('/src/views/SettingsView.vue')
    window.workflowAudit.router.addRoute({ path: '/settings', name: 'Settings', component: SettingsView })
  })
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '外观', exact: true }).click()
  const selected = page.locator('[data-theme-preset="ocean-glass"]')
  await selected.focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.body.dataset.theme === 'blue' && document.body.dataset.style === 'glass')
  assert.equal(await selected.getAttribute('aria-pressed'), 'true')
  await page.evaluate(() => document.querySelector('.settings-panel').scrollTo({ top: 0, behavior: 'instant' }))
  await page.locator('.n-message').waitFor({ state: 'hidden' })
  await page.screenshot({ path: `${output}/theme-gallery.png`, animations: 'disabled' })
  assert.deepEqual(errors, [])
  assert.deepEqual(await page.evaluate(() => window.workflowAudit.calls.filter(call => call.command.startsWith('write_') || call.command === 'ai_chat_completion')), [])
  const checks = ['Eight actual presets apply without resetting document/file preferences', 'Six distinct workspace surface treatments', 'Default sidebar statistics remain readable', 'Theme cards apply by keyboard and expose the active state', 'Theme changes do not write documents or send AI requests']
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ checks, surfaces, errors, scope: 'Production App, LibraryMode, Vditor and SettingsView with mock native IPC; actual page renders.' }, null, 2) + '\n')
  console.log(JSON.stringify({ checks, presets: presets.length, errors }))
} finally {
  await browser.close()
}
