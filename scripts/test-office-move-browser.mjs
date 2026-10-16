import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY || 'docs/evidence/v116-office-save-coordination/browser'
const base = process.env.LONGEDIT_TEST_BASE_URL || 'http://127.0.0.1:9000'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined })
const checks = [], layouts = [], errors = []
const text = '整理文件时也要保留的用户修改'
const contrast = (foreground, background) => {
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}
const settle = async page => {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.waitForFunction(() => !document.querySelector('.n-message') && !document.getAnimations().some(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity))
}
let page
try {
  for (const surface of ['docx', 'pptx', 'workbook']) {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.setDefaultTimeout(20000)
    page.on('pageerror', error => errors.push({ surface, message: error.message }))
    await page.goto(`${base}/scripts/fixtures/office-move-browser.html?surface=${surface}&panels`)
    await page.waitForFunction(() => Boolean(window.officeMoveAudit))
    let edit, action
    if (surface === 'docx') {
      await page.getByTitle('打开 DOCX 页面编辑').click()
      edit = page.locator('.docx-editor textarea')
      await edit.fill(text)
      await page.locator('.verify-edit').click()
      await page.getByText('隔离验证通过', { exact: true }).waitFor()
      action = page.locator('.copy-save').getByRole('button', { name: '保存到原文件', exact: true })
    } else if (surface === 'pptx') {
      await page.getByTestId('m1b1c-edit-prepare').click()
      edit = page.getByTestId('c4b-text-value')
      await edit.fill(text)
      await page.getByTestId('c4b-text-preview').click()
      action = page.getByTestId('m1b1c-save-source')
      await page.waitForFunction(() => !document.querySelector('[data-testid="m1b1c-save-source"]').disabled)
    } else {
      await page.locator('.workbook-cell').first().dblclick()
      edit = page.locator('input[placeholder="当前单元格不可编辑"]')
      await edit.fill(text); await edit.press('Enter')
      action = page.getByRole('button', { name: '保存 (1)', exact: true })
    }
    const act = async () => {
      await action.click()
      if (surface !== 'workbook') await page.getByRole('dialog').getByRole('button', { name: '保存到原文件', exact: true }).click()
    }
    assert.equal(await page.evaluate(() => window.officeMoveAudit.requests.length), 0, 'editing and validation must not save')
    await page.evaluate(() => { window.officeMoveAudit.blocked = true })
    await act()
    await page.getByText(/文档正在保存或整理，请保留修改并稍后重试/).first().waitFor()
    if (surface !== 'pptx') assert.equal(await edit.inputValue(), text)
    if (surface === 'pptx') assert.equal(await page.getByText('1 个更改尚未保存', { exact: true }).count(), 1)
    assert.equal(await page.evaluate(() => window.officeMoveAudit.savedText), null)
    assert.ok(await page.evaluate(() => window.officeMoveAudit.draftCount > 0))
    checks.push(`${surface}: actual input and verification do not save; reservation failure retains draft and retry, no false success`)
    for (const theme of ['white', 'dark', 'contrast']) for (const width of [1280, 480]) for (const style of ['soft', 'neo', 'glass', 'airy', 'minimal', 'sharp']) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(({ style, theme }) => {
        window.officeMoveAudit.store.visualStyle = style
        document.body.dataset.style = style; document.documentElement.dataset.style = style
        document.body.dataset.theme = theme; document.documentElement.dataset.theme = theme
      }, { style, theme })
      await settle(page)
      await action.scrollIntoViewIfNeeded(); await action.click({ trial: true })
      assert.ok(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--theme-primary').trim()))
      const bounds = await action.boundingBox()
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 901, 'retry must fit viewport')
      if (surface === 'docx') {
        const colors = await action.evaluate(button => {
          const style = getComputedStyle(button)
          return { foreground: style.color, background: style.backgroundColor }
        })
        assert.notEqual(colors.foreground, colors.background, 'Save label must not merge into its background')
        assert.notEqual(colors.background, 'rgba(0, 0, 0, 0)', 'Save must resolve its real theme color, not an undefined legacy token')
        assert.ok(contrast(colors.foreground, colors.background) >= 4.5, 'Save text must meet AA contrast in light, dark and high-contrast palettes')
      }
      assert.ok(await page.evaluate(() => window.officeMoveAudit.draftCount > 0))
      layouts.push({ surface, theme, width, style, retryReachable: true, draftRetained: true, motion: 'calm' })
    }
    await page.screenshot({ path: `${output}/${surface}-contrast-narrow.png` })
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const theme of ['dark', 'white']) {
      await page.evaluate(theme => { document.body.dataset.theme = theme; document.documentElement.dataset.theme = theme }, theme)
      await settle(page)
      await page.screenshot({ path: `${output}/${surface}-${theme}.png` })
    }
    await page.evaluate(() => { window.officeMoveAudit.blocked = false })
    await act()
    if (surface === 'workbook') {
      await page.waitForFunction(() => Boolean(window.workbookAudit.pending))
      await page.evaluate(() => window.workbookAudit.pending())
      await page.getByRole('button', { name: '已保存', exact: true }).waitFor()
    } else {
      await page.waitForFunction(() => window.officeMoveAudit.savedText !== null && window.officeMoveAudit.draftCount === 0)
      const saved = await page.evaluate(() => window.officeMoveAudit.disk)
      assert.equal(surface === 'docx' ? saved.model.blocks[0].text : saved.model.slides[0].objects[0].text, text)
    }
    const requests = await page.evaluate(() => window.officeMoveAudit.requests)
    assert.equal(requests.length, 2)
    assert.equal(requests[0].blocked, true); assert.equal(requests[1].blocked, false)
    assert.deepEqual(requests[1].args, requests[0].args)
    checks.push(`${surface}: explicit retry sends exactly the preserved request and only a verified receipt clears the draft`)
    await page.close()
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ scope: 'Real Office Vue pages, actual clicks/input, isolated IPC. Not native filesystem, multi-window freeze or installed acceptance.', checks, layouts, errors }, null, 2) + '\n')
  console.log(`Office move continuity passed: ${checks.length} checks, ${layouts.length} layouts, ${errors.length} page errors`)
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {})
  throw error
} finally { await browser.close() }
