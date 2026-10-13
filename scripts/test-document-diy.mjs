import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const out = 'docs/evidence/v110-document-diy'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch(), errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/display-preferences-browser.html')
  await page.getByLabel('正文字体', { exact: true }).click()
  await page.locator('.n-base-select-menu').hover()
  await page.mouse.wheel(0, 650)
  await page.getByText('自定义已安装字体…', { exact: true }).click()
  await page.getByRole('textbox', { name: '已安装字体名称' }).fill('Microsoft YaHei')
  await page.getByText('更多排版选项', { exact: true }).click()
  for (const [name, value] of [['正文字距', '1'], ['段后间距', '1.5']]) {
    const input = page.getByRole('spinbutton', { name, exact: true })
    await input.fill(value); await input.press('Tab')
  }
  await page.getByText('两端对齐', { exact: true }).click()
  const appearance = await page.locator('.display-document-preview p').evaluate(el => {
    const s = getComputedStyle(el)
    return { font: s.fontFamily, spacing: s.letterSpacing, margin: s.marginBottom, align: s.textAlign }
  })
  assert.ok(appearance.font.includes('Microsoft YaHei'))
  assert.equal(appearance.spacing, '1px')
  assert.equal(appearance.margin, '24px')
  assert.equal(appearance.align, 'justify')
  const saved = await page.evaluate(() => window.displayAudit.saves.at(-1).displayPreferences)
  assert.equal(saved.documentCustomFont, 'Microsoft YaHei')
  assert.equal(saved.documentLetterSpacing, 1)
  assert.equal(saved.documentParagraphSpacing, 1.5)
  await page.screenshot({ path: out + '/settings.png', fullPage: true })
  await page.setViewportSize({ width: 480, height: 850 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: out + '/narrow.png', fullPage: true })
  await page.getByRole('button', { name: '恢复显示默认值' }).click()
  await page.waitForFunction(() => window.displayAudit.store.displayPreferences.documentCustomFont === '')
  assert.equal(await page.locator('.display-document-preview p').evaluate(el => getComputedStyle(el).letterSpacing), 'normal')
  // Apply the persisted snapshot to the real App to verify editor propagation.
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.getByRole('region', { name: '工作现场', exact: true }).getByRole('button', { name: '继续工作', exact: true }).click()
  await page.locator('.vditor-wysiwyg p').first().waitFor()
  await page.evaluate(saved => { window.workflowAudit.store.displayPreferences = saved }, saved)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.vditor-wysiwyg p')).letterSpacing === '1px')
  assert.equal(await page.locator('.vditor-wysiwyg p').first().evaluate(el => getComputedStyle(el).textAlign), 'justify')
  assert.deepEqual(errors, [])
  await fs.writeFile(out + '/results.json', JSON.stringify({ appearance, saved, checks: ['UI edit and preview', 'Config payload retains new fields', 'Narrow layout', 'Reset', 'Real App editor uses saved preferences'], errors, scope: 'Actual Vue/Vditor; mocked native IPC' }, null, 2) + '\n')
  console.log('Document DIY checks passed')
} finally { await browser.close() }
