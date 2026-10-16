// Design proposal only. This intentionally injected style is NOT acceptance.
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v116-office-save-coordination/theme-proposal'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${process.env.LONGEDIT_TEST_BASE_URL || 'http://127.0.0.1:9000'}/scripts/fixtures/office-move-browser.html?surface=docx`)
  await page.waitForFunction(() => Boolean(window.officeMoveAudit))
  await page.getByTitle('打开 DOCX 页面编辑').click()
  await page.locator('.docx-editor textarea').fill('整理文件时也要保留的用户修改')
  await page.locator('.verify-edit').click()
  await page.getByText('隔离验证通过', { exact: true }).waitFor()
  await page.screenshot({ path: `${output}/before.png` })
  await page.addStyleTag({ content: '.docx-workspace { --primary-color: var(--theme-primary); --text-muted: var(--theme-text-secondary); --hover-bg: var(--workspace-control-hover-bg); --error-color: var(--status-danger); }' })
  await page.screenshot({ path: `${output}/proposal.png` })
  console.log('Proposal only: original layout, canonical theme colors; not product acceptance')
} finally { await browser.close() }
