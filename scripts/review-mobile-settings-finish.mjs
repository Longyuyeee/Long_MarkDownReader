import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { seed, store } from './fixtures/mobile-library-management-v3.mjs'

const require = createRequire(import.meta.url)
const foundationVersion = JSON.parse(await readFile('package.json', 'utf8')).version
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const [stage, group = 'all'] = process.argv.slice(2)
assert.match(stage || '', /^[a-z0-9-]+$/)
assert.ok(['all', 'transfers', 'about', 'help'].includes(group))
const output = `docs/evidence/mobile-0.1.0/settings-finish-v3-2026-11-07/${stage}`
await mkdir(output, { recursive: false })
const url = process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9040/mobile.html'
const report = { stage, group, passed: false, screens: [], checks: [], scans: [], errors: [] }
const recordLabels = [
  '文件导入记录', 'PDF 接收记录', '图片导入记录', '附件包导入记录', '附件包导出记录'
]
const baseline = stage.startsWith('before')
const variants = baseline ? [['light', 390, 872, 16]] : [
  ['light', 390, 872, 16], ['dark', 390, 872, 16], ['large', 320, 502, 32]
]

let browser
let page
const button = name => page.getByRole('button', { name, exact: true })
const detail = id => page.locator(`[data-focus-key="settings-${id}"]`)
const dialog = () => page.locator('.mobile-help-dialog')
const back = () => page.evaluate(() => window.__longeditMobileBack())

async function shot(name) {
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.screenshot({ path: `${output}/${name}.png` })
  const geometry = await page.evaluate(() => {
    const bounds = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON()
    return {
      viewport: [innerWidth, innerHeight],
      overflow: document.documentElement.scrollWidth > innerWidth,
      header: bounds('.settings-page-header'),
      panel: bounds('.settings-detail-body > div'),
      help: bounds('.mobile-help-dialog'),
      helpBody: bounds('.mobile-help-content')
    }
  })
  assert.equal(geometry.overflow, false, name)
  report.screens.push({ name, ...geometry })
}

async function focused(locator) {
  await locator.evaluate(e => new Promise((resolve, reject) => {
    const timeout = performance.now() + 2000
    function check() {
      if (document.activeElement === e) resolve()
      else if (performance.now() > timeout) reject(new Error('Focus did not return to ' + e.textContent))
      else requestAnimationFrame(check)
    }
    check()
  }))
}

async function verifyHelpText(body, cdp) {
  assert.equal(await body.getAttribute('aria-label'), null)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const accessibleText = nodes.filter(node => node.role?.value === 'StaticText').map(node => node.name?.value).join('')
  for (const paragraph of await body.locator('p').allTextContents()) assert.ok(accessibleText.includes(paragraph))
}

async function scan(name) {
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const result = await page.evaluate(async () => {
    const result = await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return {
      violations: result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(n => n.target) })),
      incomplete: result.incomplete.map(({ id, nodes }) => ({ id, targets: nodes.map(n => n.target) }))
    }
  })
  report.scans.push({ name, ...result })
  assert.deepEqual(result.violations, [], name)
}

try {
  for (const [variant, width, height, font] of variants) {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: [`--blink-settings=defaultFontSize=${font},defaultFixedFontSize=${font}`]
    })
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce'
    })
    await seed(context, { dark: variant === 'dark' })
    page = await context.newPage()
    page.on('pageerror', e => report.errors.push(String(e)))
    if (stage === 'before') {
      const reference = pathToFileURL(resolve('docs/design/mobile-settings-pages-v1/index.html'))
      for (const id of ['transfers', 'about']) {
        reference.searchParams.set('screen', id)
        await page.goto(reference.href)
        await page.locator('#phone').screenshot({ path: `${output}/reference-${id}.png` })
      }
    }
    await page.goto(url)
    await page.locator('.file-row').first().waitFor()
    const original = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), store)
    if (group !== 'help') await button('设置').tap()

    if (group === 'all' || group === 'transfers') {
      await detail('transfers').tap()
      await page.getByRole('heading', { name: '导入与导出', exact: true }).waitFor()
      await shot(`${variant}-transfers`)
      if (!baseline) {
        await scan(`${variant}-transfers`)
        if (variant === 'large') {
          for (const label of recordLabels) {
            const row = await button(label).boundingBox()
            assert.ok(row.height >= 48 && row.y + row.height <= height, label)
          }
        }
        for (const label of recordLabels) {
          const entry = button(label)
          await entry.scrollIntoViewIfNeeded()
          const before = await page.evaluate(() => scrollY)
          await entry.tap()
          const sheet = page.locator('.bottom-sheet')
          await sheet.waitFor()
          await page.waitForFunction(() => {
            const control = document.querySelector('.sheet-heading .icon-button')
            return control && !control.disabled
          })
          await back()
          await sheet.waitFor({ state: 'hidden' })
          await focused(entry)
          assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 2, label)
        }
        report.checks.push(`${variant}: five history destinations restore the opener and scroll after Back`)
      }
      await button('返回设置').tap()
      await focused(detail('transfers'))
    }

    if (group === 'all' || group === 'about') {
      await detail('about').tap()
      await page.locator('.settings-about').waitFor()
      await shot(`${variant}-about`)
      if (!baseline) {
        await scan(`${variant}-about`)
        assert.ok((await page.locator('.settings-about').innerText()).includes('基础引擎 ' + foundationVersion))
        if (variant === 'large') {
          const card = await page.locator('.settings-about').boundingBox()
          assert.ok(card.y + card.height <= height, 'The entire About card is visible without scrolling')
          const meta = page.locator('.settings-about small > span:not(.about-meta-divider)')
          const first = await meta.nth(0).boundingBox(), last = await meta.nth(1).boundingBox()
          assert.ok(last.y - first.y - first.height <= 8, 'Version and platform are adjacent')
        }
      }
      await back()
      await focused(detail('about'))
      if (!baseline) report.checks.push(`${variant}: About shows the desktop version and Back restores the opener`)
      if (!baseline && group === 'all') {
        const opener = page.locator('.settings-home .mobile-help-trigger')
        await opener.tap()
        await dialog().waitFor()
        await page.waitForTimeout(200)
        await shot(variant + '-settings-help')
        const cdp = await context.newCDPSession(page)
        await verifyHelpText(dialog().locator('.mobile-help-content'), cdp)
        await cdp.detach()
        await button('关闭说明').tap()
        await dialog().waitFor({ state: 'hidden' })
        await focused(opener)
        report.checks.push(`${variant}: Settings opens shared help and the close button restores its question mark`)
      }
    }

    if (group === 'all' || group === 'help') {
      if (group === 'all') await button('资料').tap()
      const pdf = await readFile('scripts/fixtures/mobile-pdf-navigation-design.pdf')
      await page.getByLabel('选择 PDF 文件', { exact: true }).setInputFiles({
        name: '阅读指南.pdf', mimeType: 'application/pdf', buffer: pdf
      })
      await page.waitForFunction(() => document.querySelector('.textLayer span') && !document.querySelector('.pdf-render-status'))
      await button('PDF 操作').tap()
      const opener = button('PDF阅读说明')
      await opener.tap()
      await dialog().waitFor()
      await page.waitForTimeout(350)
      await shot(`${variant}-pdf-help`)
      if (!baseline) {
        const menu = page.locator('.pdf-action-layer')
        assert.equal(await menu.isVisible(), false)
        const close = button('关闭说明')
        const bounds = await close.boundingBox()
        assert.ok(bounds.width >= 48 && bounds.height >= 48)
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height)
        if (variant === 'large') {
          const chineseLines = await dialog().getByRole('heading').evaluate(element => {
            const text = [...element.childNodes].find(node => node.textContent === '阅读说明')
            if (!text) return 0
            const range = document.createRange()
            range.selectNodeContents(text)
            return range.getClientRects().length
          })
          assert.equal(chineseLines, 1, 'The Chinese title stays together after PDF')
        }
        const body = dialog().locator('.mobile-help-content')
        assert.equal(await body.locator('p').count(), 5)
        const cdp = await context.newCDPSession(page)
        await verifyHelpText(body, cdp)
        await scan(`${variant}-pdf-help`)
        await page.keyboard.press('Tab')
        await focused(close)
        await page.keyboard.press('Tab')
        await focused(body)
        if (variant === 'large') {
          await page.keyboard.press('End')
          await page.waitForFunction(() => {
            const body = document.querySelector('.mobile-help-content')
            return body.scrollTop > 0 && Math.abs(body.scrollHeight - body.clientHeight - body.scrollTop) < 2
          })
          await shot('large-pdf-help-end')
        }
        await back()
        await dialog().waitFor({ state: 'hidden' })
        await focused(opener)
        await opener.tap()
        const handle = await dialog().locator('.mobile-help-grip').boundingBox()
        const x = Math.round(handle.x + handle.width / 2), y = Math.round(handle.y + handle.height / 2)
        for (const distance of [30, 90]) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
          for (let offset = 10; offset <= distance; offset += 10) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + offset }] })
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          if (distance === 30) {
            assert.equal(await dialog().isVisible(), true)
            assert.equal(await dialog().evaluate(element => element.style.transform), '')
          }
        }
        await dialog().waitFor({ state: 'hidden' })
        await focused(opener)
        await back()
        await page.getByRole('dialog', { name: 'PDF 操作', exact: true }).waitFor({ state: 'hidden' })
        assert.ok(await page.locator('.textLayer span').count())
        report.checks.push(`${variant}: PDF help scroll, Back, touch drag and return through the PDF menu`)
      }
    }
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), store)
    for (const key of ['documents', 'drafts', 'fileImports', 'packImports', 'pdfImports', 'images', 'exports']) {
      assert.deepEqual(after[key], original[key], key)
    }
    await browser.close()
    browser = undefined
  }
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  report.failure = String(error.stack || error)
  await page?.screenshot({ path: `${output}/failure.png`, timeout: 3000 }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser?.close()
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, screens: report.screens.length, checks: report.checks.length, failure: report.failure }))
