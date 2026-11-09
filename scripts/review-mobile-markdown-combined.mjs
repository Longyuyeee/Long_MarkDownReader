import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { markdownV3Name, markdownV3Source } from './fixtures/mobile-markdown-v3.mjs'

const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const [stage] = process.argv.slice(2)
assert.match(stage || '', /^[a-z0-9-]+$/)
const before = stage.startsWith('before')
const root = 'docs/evidence/mobile-0.1.0/markdown-combined-v3'
await mkdir(root, { recursive: true })
await writeFile(root + '/.gitignore', '*\n!.gitignore\n')
const output = root + '/' + stage
await mkdir(output)
const key = JSON.stringify(['local', markdownV3Name])
const report = { passed: false, screens: [], checks: [] }
let browser, page

async function shot(name) {
  await page.evaluate(() => document.fonts.ready.then(() => true))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: `${output}/${name}.png` })
  report.screens.push(name)
}

try {
  for (const [variant, width, height, font] of [
    ['light', 390, 872, 16], ['dark', 390, 872, 16], ['large', 320, 502, 32]
  ]) {
    browser = await chromium.launch({
      channel: 'chrome', args: [`--blink-settings=defaultFontSize=${font},defaultFixedFontSize=${font}`]
    })
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    await context.addInitScript(({ key, name, content, dark }) => {
      if (window !== top) return
      localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({
        version: 1, documents: { [key]: { rootId: 'local', relativePath: name, content, signature: content, modified: 1 } }, drafts: {}
      }))
      localStorage.setItem('longedit-mobile-preferences-v1', JSON.stringify({ version: 1, theme: dark ? 'dark' : 'light' }))
    }, { key, name: markdownV3Name, content: markdownV3Source, dark: variant === 'dark' })
    page = await context.newPage()
    await page.goto('http://127.0.0.1:9012/mobile.html')
    await page.locator('.file-row').filter({ hasText: markdownV3Name }).tap()
    const reader = page.frameLocator('iframe.mobile-reader')
    const edit = page.getByRole('button', { name: '编辑', exact: true })
    const quote = reader.locator('blockquote p')
    await quote.waitFor()
    await quote.evaluate(() => document.fonts.ready.then(() => true))
    await edit.waitFor()
    await shot(variant + '-reading')
    if (variant !== 'large') {
      await quote.dblclick({ position: { x: 42, y: 12 } })
      await quote.evaluate(element => new Promise((resolve, reject) => {
        const until = performance.now() + 2000
        function check() {
          if (getSelection()?.toString() && element.contains(getSelection().anchorNode)) resolve()
          else if (performance.now() > until) reject(Error('Reader text selection missing'))
          else requestAnimationFrame(check)
        }
        check()
      }))
      if (!before) await edit.waitFor({ state: 'hidden' })
      await shot(variant + '-selected')
      await quote.click({ position: { x: 16, y: 12 } })
      await edit.waitFor()
      report.checks.push(variant + (before
        ? ': captured the selection state before adjusting Edit'
        : ': selected text leaves the reading canvas clear, and a tap restores Edit'))
    }
    await edit.tap()
    await page.getByRole('textbox', { name: '笔记正文' }).waitFor()
    if (variant !== 'large') await page.setViewportSize({ width, height: 502 })
    await shot(variant + '-editor')
    if (!before) assert.equal(await page.locator('.cm-cursor-primary').evaluate(cursor =>
      getComputedStyle(cursor).borderLeftColor === getComputedStyle(document.querySelector('.cm-md-bom-heading')).color
    ), true, 'CodeMirror cursor uses the theme caret color')
    if (!before && variant === 'large') {
      const title = await page.locator('.document-heading h1').evaluate(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const rect = element.getBoundingClientRect()
        return { rect: rect.toJSON(), lines: [...range.getClientRects()].map(line => line.toJSON()) }
      })
      assert.equal(title.lines.length, 2)
      for (const line of title.lines) {
        assert.ok(line.right <= title.rect.right + 1 && line.bottom <= title.rect.bottom + 1, 'The entire fixture filename fits')
      }
    }
    assert.equal(await page.locator('.format-tools button').count(), 6)
    await page.evaluate(() => window.__longeditMobileBack())
    await quote.waitFor()
    await edit.waitFor()
    await page.evaluate(() => window.__longeditMobileBack())
    await page.locator('.file-row').filter({ hasText: markdownV3Name }).waitFor()
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
    assert.equal(data.documents[key].content, markdownV3Source)
    assert.deepEqual(data.drafts, {})
    report.checks.push(variant + ': Edit, then Back to reading and library, preserves source and draft data')
    await browser.close()
    browser = undefined
  }
  report.passed = true
} catch (error) {
  report.failure = String(error.stack || error)
  await page?.screenshot({ path: output + '/failure.png', timeout: 3000 }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser?.close()
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, screens: report.screens.length, checks: report.checks.length, failure: report.failure }))
