import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const require = createRequire(import.meta.url)
const {chromium} = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({channel:'msedge', headless:true})
const output = 'docs/evidence/v110-display-preferences'
await fs.mkdir(output,{recursive:true})
const checks = [], errors = []
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}})
  page.on('pageerror',error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/display-preferences-browser.html')
  await page.getByText('文档显示',{exact:true}).waitFor()
  const surfaces = []
  for (const style of ['soft','neo','glass','airy','minimal','sharp']) {
    await page.evaluate(style => {document.body.dataset.style=style},style)
    surfaces.push(await page.locator('.display-file-row').first().evaluate(row => ({height:getComputedStyle(row).minHeight, radius:getComputedStyle(row).borderRadius, border:getComputedStyle(row).borderTopColor})))
  }
  assert.ok(new Set(surfaces.map(row => row.height)).size >= 4)
  assert.ok(new Set(surfaces.map(row => row.radius)).size >= 5)
  checks.push('six existing surface styles change row shape and density')
  await page.getByText('纸张',{exact:true}).click()
  await page.getByText('紧凑',{exact:true}).click()
  await page.getByText('卡片',{exact:true}).click()
  await page.getByText('单色',{exact:true}).click()
  const fontSize = page.getByRole('spinbutton',{name:'正文字号'})
  await fontSize.fill('20'); await fontSize.press('Tab')
  await page.waitForFunction(() => window.displayAudit.store.displayPreferences.documentFontSize === 20)
  const appearance = await page.locator('.display-document-preview').evaluate(el => ({fontSize:getComputedStyle(el).fontSize, shadow:getComputedStyle(el).boxShadow, border:getComputedStyle(el).borderTopWidth}))
  assert.equal(appearance.fontSize,'20px')
  assert.notEqual(appearance.shadow,'none')
  assert.equal(appearance.border,'1px')
  assert.equal(await page.locator('.display-file-row').first().evaluate(el => getComputedStyle(el).minHeight),'26px')
  const saved = await page.evaluate(() => window.displayAudit.saves.at(-1))
  assert.equal(saved.displayPreferences.documentStyle,'paper')
  assert.equal(saved.displayPreferences.fileRowStyle,'cards')
  assert.equal(saved.displayPreferences.fileIconStyle,'muted')
  checks.push('document presentation and file controls preview and persist together')
  await page.screenshot({path:output+'/01-display-settings.png',fullPage:true})
  await page.getByRole('button',{name:'恢复显示默认值'}).click()
  await page.waitForFunction(() => window.displayAudit.store.displayPreferences.documentStyle === 'auto')
  const state = await page.evaluate(() => ({theme:window.displayAudit.store.theme,markers:window.displayAudit.store.fileDisplayStyles,preferences:window.displayAudit.store.displayPreferences}))
  assert.equal(state.theme,'cream')
  assert.equal(state.markers['C:/notes/plan.md'].icon,'flag')
  assert.equal(state.preferences.documentFontSize,16)
  checks.push('display reset preserves chosen color theme and per-file markers')
  assert.deepEqual(errors,[])
  await fs.writeFile(output+'/report.json',JSON.stringify({checks,errors,surfaces,appearance},null,2))
  console.log(JSON.stringify({checks,errors},null,2))
} finally {await browser.close()}

