import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY || 'docs/evidence/v116-secondary-write-coordination/browser'
const base = process.env.LONGEDIT_TEST_BASE_URL || 'http://127.0.0.1:9000'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined })
const checks = [], layouts = [], errors = []
let page
try {
  for (const surface of ['workspace', 'table', 'graph-health']) {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.setDefaultTimeout(20000)
    page.on('pageerror', error => errors.push({ surface, message: error.message }))
    await page.goto(`${base}/scripts/fixtures/secondary-write-browser.html?surface=${surface}`)
    await page.waitForFunction(() => Boolean(window.secondaryWriteAudit))
    let action, edit
    if (surface === 'workspace') action = page.getByTestId('m2a1-task-complete').first()
    if (surface === 'table') {
      edit = page.locator('.data-cell input').nth(1)
      await edit.fill('文件整理期间也不能丢失的备注')
      action = page.locator('.save-button')
    }
    if (surface === 'graph-health') action = page.locator('.candidate-list button').first()
    const act = async () => {
      await action.click()
      if (surface === 'workspace') await page.getByRole('dialog').getByRole('button', { name: '完成待办', exact: true }).click()
    }
    assert.equal(await page.evaluate(() => window.secondaryWriteAudit.requests.length), 0)
    await act()
    await page.getByText(/文档正在保存或整理，请保留修改并稍后重试/).first().waitFor()
    if (surface === 'workspace') {
      assert.equal(await page.getByTestId('m2a1-task-complete').count(), 2)
      assert.equal(await page.getByTestId('m2a1-task-undo').count(), 0)
    } else if (surface === 'table') {
      assert.equal(await edit.inputValue(), '文件整理期间也不能丢失的备注')
      assert.ok(await page.evaluate(() => window.secondaryWriteAudit.draftCount > 0))
      assert.equal(await page.evaluate(() => window.tableAudit.disk.rows[0][1]), '待处理')
    } else {
      assert.equal(await page.locator('.issue-card').count(), 1)
      assert.match(await page.locator('.issue-target').innerText(), /\[\[Targt\|目标笔记\]\]/)
    }
    checks.push(`${surface}: native reservation rejection keeps the original task/issue or real user draft; no optimistic success`)
    for (const width of [1280, 480]) for (const style of ['soft', 'neo', 'glass', 'airy', 'minimal', 'sharp']) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(style => {
        window.secondaryWriteAudit.store.visualStyle = style
        document.body.dataset.style = style; document.documentElement.dataset.style = style
      }, style)
      await page.waitForFunction(() => !document.querySelector('.n-message') && !document.getAnimations().some(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity))
      await action.scrollIntoViewIfNeeded(); await action.click({ trial: true })
      assert.ok(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--theme-primary').trim()), 'fixture must load the real App palette')
      const bounds = await action.boundingBox()
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 901, 'retry action must actually fit the viewport')
      if (edit) assert.equal(await edit.inputValue(), '文件整理期间也不能丢失的备注')
      layouts.push({ surface, width, style, retryReachable: true, motion: 'calm' })
    }
    await page.screenshot({ path: `${output}/${surface}-narrow.png` })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.screenshot({ path: `${output}/${surface}-wide.png` })
    await page.evaluate(() => { window.secondaryWriteAudit.blocked = false })
    await act()
    if (surface === 'table') {
      await page.waitForFunction(() => Boolean(window.tableAudit.pending))
      await page.evaluate(() => window.tableAudit.pending())
      await page.waitForFunction(() => document.querySelector('.save-button')?.textContent === '已保存')
      assert.equal(await page.evaluate(() => window.tableAudit.disk.rows[0][1]), '文件整理期间也不能丢失的备注')
    } else if (surface === 'workspace') {
      await page.getByTestId('m2a1-task-undo').waitFor()
      assert.equal(await page.getByTestId('m2a1-task-complete').count(), 1)
    } else {
      await page.getByText('已修复 1 条链接，更新 1 个文件。', { exact: true }).waitFor()
      assert.equal(await page.locator('.issue-card').count(), 0)
    }
    const requests = await page.evaluate(() => window.secondaryWriteAudit.requests)
    assert.equal(requests.length, 2)
    assert.equal(requests[0].blocked, true); assert.equal(requests[1].blocked, false)
    assert.deepEqual(requests[1].args, requests[0].args, 'explicit retry must preserve the original request')
    if (surface === 'workspace') {
      await page.getByTestId('m2a1-task-undo').click()
      await page.waitForFunction(() => window.secondaryWriteAudit.requests.length === 3)
      assert.equal(await page.getByTestId('m2a1-task-complete').count(), 2)
    }
    checks.push(`${surface}: explicit retry succeeds with the preserved request${surface === 'workspace' ? ' and normal task undo remains available' : ''}`)
    await page.close()
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(`${output}/results.json`, JSON.stringify({
    scope: 'Actual WorkspaceHome/App, TableView and GraphHealthPanel, real user input/clicks, isolated native responses; not native disk, multi-window freeze or installed proof',
    checks, layouts, errors,
  }, null, 2) + '\n')
  console.log(`Secondary write continuity passed: ${checks.length} checks, ${layouts.length} layouts, ${errors.length} page errors`)
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {})
  throw error
} finally { await browser.close() }
