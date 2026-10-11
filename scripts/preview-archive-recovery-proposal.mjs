import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const source = process.argv[2]
if (!source) throw Error('Pass the absolute proposal fragment path')
const fragment = await fs.readFile(source, 'utf8')
const out = path.resolve('docs/evidence/v110-archive-recovery-proposal')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [800, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } })
    await page.setContent(`<meta charset="UTF-8"><style>:root{color-scheme:light}body{margin:0}</style>${fragment}`)
    await page.getByRole('button', { name: '核对未完成项' }).click()
    await page.getByRole('status').filter({ hasText: '不会执行移动' }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: path.join(out, `proposal-${width}.png`), fullPage: true })
    await page.close()
  }
  console.log('PASS: proposal 800/360px layout and local interaction; design only')
} finally { await browser.close() }
