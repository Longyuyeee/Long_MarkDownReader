import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({viewport:{width:1024,height:1100}})
const errors = []
page.on('pageerror', error => errors.push(error.message))
const output = 'docs/evidence/v110-shell-proposal'
const checks = []
try {
  await page.goto(pathToFileURL(path.resolve(output, 'resume-preview.html')).href)
  const frame = page.frameLocator('iframe')
  const root = frame.locator('#le110-proposal')
  await root.waitFor()
  await root.screenshot({path:output+'/resume-1024.png'})
  await root.locator('[data-action="navigation"]').click()
  assert.equal(await root.locator('#le-navigation').isVisible(), false)
  await root.locator('[data-action="navigation"]').click()
  assert.equal(await root.locator('#le-navigation').isVisible(), true)
  checks.push('navigation toggle preserves access')
  for (const name of ['outline','recent','collections','tags','links','history','files']) {
    await root.locator(`.le-navigation [data-panel="${name}"]`).click()
    assert.equal(await root.locator(`[data-panel-content="${name}"]`).isVisible(), true)
  }
  checks.push('all seven navigation panels remain reachable')
  await root.locator('.le-document-actions [data-action="reference"]').click()
  assert.equal(await root.locator('#le-reference').isVisible(), true)
  await root.screenshot({path:output+'/resume-reference-1024.png'})
  await root.locator('[data-action="insert"]').click()
  assert.match(await root.locator('.le-editor').innerText(), /会议记录.md，第 6 行/)
  assert.match(await root.locator('[data-save-state]').innerText(), /未保存/)
  await root.locator('[data-action="save"]').click()
  assert.equal(await root.locator('[data-save-state]').innerText(), '已保存')
  checks.push('reference excerpt insertion marks draft and explicit save updates state')
  await root.locator('.le-status [data-action="zen"]').click()
  assert.equal(await root.locator('.le-chrome').isVisible(), false)
  await root.locator('.le-status [data-action="zen"]').click()
  assert.equal(await root.locator('.le-chrome').isVisible(), true)
  checks.push('focus mode has a visible exit')
  await root.locator('#le-reference [data-action="reference"]').click()
  await root.locator('.le-search input').fill('会议')
  assert.equal(await root.locator('[data-panel-content="files"] [data-file="会议记录"]').isVisible(), true)
  assert.equal(await root.locator('[data-panel-content="files"] [data-file="项目方案"]').isVisible(), false)
  await root.locator('.le-search input').fill('')
  checks.push('search filters file list and clears correctly')
  for (const width of [736,320]) {
    await page.setViewportSize({width,height:1400})
    assert.equal(await root.evaluate(el => el.ownerDocument.documentElement.scrollWidth <= el.ownerDocument.documentElement.clientWidth), true)
    await root.screenshot({path:output+`/resume-${width}.png`})
    await root.locator('.le-document-menu > summary').click()
    const outside = await root.evaluate(el => {
      const max = el.ownerDocument.documentElement.clientWidth
      return [...el.querySelectorAll('.le-document-menu .le-popover button,.le-document-menu select')].filter(e => {const r=e.getBoundingClientRect();return r.width && (r.left<0 || r.right>max+1)}).map(e=>e.textContent)
    })
    assert.deepEqual(outside, [])
    await root.screenshot({path:output+`/resume-menu-${width}.png`})
    await root.locator('.le-document-menu > summary').click()
  }
  checks.push('736px and 320px layouts and document menu fit')
  assert.deepEqual(errors, [])
  checks.push('no browser script errors')
  await fs.writeFile(output+'/resume-checks.json', JSON.stringify({scope:'interactive design proposal, not production UI',checks},null,2)+'\n')
  console.log(JSON.stringify({checks}))
} finally { await browser.close() }
