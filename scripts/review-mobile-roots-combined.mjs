import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { back, fixture, seed, store } from './fixtures/mobile-library-management-v3.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const [stage] = process.argv.slice(2)
assert.match(stage || '', /^[a-z0-9-]+$/)
const baseline = stage.startsWith('before')
const root = 'docs/evidence/mobile-0.1.0/roots-combined-v3'
await mkdir(root, { recursive: true })
await writeFile(root + '/.gitignore', '*\n!.gitignore\n')
const output = root + '/' + stage
await mkdir(output)
const report = { passed: false, screens: [], checks: [], errors: [] }
let browser, page
const button = name => page.getByRole('button', { name, exact: typeof name === 'string' })
const help = () => page.locator('.mobile-help-dialog')
const overlay = () => page.locator('.sheet-backdrop')
const search = () => page.getByRole('textbox', { name: '查找资料内容' })

async function shot(name) {
  await page.evaluate(() => document.fonts.ready.then(() => true))
  const data = await page.evaluate(() => {
    const bounds = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON()
    return {
      viewport: [innerWidth, innerHeight],
      overflow: document.documentElement.scrollWidth > innerWidth,
      topSheet: bounds('.mobile-help-dialog'),
      coveredSheet: bounds('.sheet-backdrop > .bottom-sheet'),
      firstRow: bounds('.file-row'),
      navigation: bounds('.bottom-navigation')
    }
  })
  assert.equal(data.overflow, false, name)
  report.screens.push({ name, ...data })
  await page.screenshot({ path: `${output}/${name}.png` })
}

async function focused(locator) {
  const element = await locator.elementHandle()
  await page.waitForFunction(el => el === document.activeElement, element)
}

async function helpFromSheet(name, trigger, opener) {
  await trigger.tap()
  await overlay().waitFor()
  await opener.tap()
  await help().waitFor()
  await page.waitForTimeout(350)
  await shot(name)
  if (!baseline) assert.equal(await overlay().isVisible(), false, name)
  await back(page)
  await focused(opener)
  await back(page)
  await focused(trigger)
  report.checks.push(name + ': Back restores the help opener, then the original page control')
}

try {
  for (const [name, width, height, font, dark] of [
    ['light', 390, 872, 16, false], ['dark', 390, 872, 16, true], ['large', 320, 502, 32, false]
  ]) {
    browser = await chromium.launch({ channel: 'chrome', args: [`--blink-settings=defaultFontSize=${font}`] })
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    const data = fixture()
    const samples = { '阅读方法.md': '# 阅读方法\n\n通过阅读了解主题。', '阅读记录.txt': '阅读练习，保留原始文本。', 'demo.py': '# 阅读样例\ndef read_text(path):\n    return open(path).read()' }
    for (const [relativePath, content] of Object.entries(samples)) {
      data.documents[JSON.stringify(['local', relativePath])] = { rootId: 'local', relativePath, content, signature: content, modified: 1 }
    }
    await seed(context, { dark, data })
    page = await context.newPage()
    page.on('pageerror', error => report.errors.push(String(error)))
    await page.goto('http://127.0.0.1:9012/mobile.html')
    await page.locator('.file-row').first().waitFor()
    await shot(name + '-library')
    await helpFromSheet(name + '-library-help', page.locator('.library-title-picker'), button('文件夹授权说明'))

    await button('搜索').tap()
    await search().fill('阅读')
    await search().press('Enter')
    const hit = page.locator('[data-result-path="阅读方法.md"]')
    await hit.waitFor()
    await shot(name + '-search')
    await helpFromSheet(name + '-search-help', button(/^搜索范围：/), button('搜索说明'))
    await hit.tap()
    await page.frameLocator('iframe.mobile-reader').getByRole('heading', { name: '阅读方法', exact: true }).waitFor()
    await back(page)
    await page.locator('iframe.mobile-reader').waitFor()
    await back(page)
    await focused(hit)
    assert.equal(await search().inputValue(), '阅读')

    await button('设置').tap()
    await shot(name + '-settings')
    if (font === 32 && !baseline) {
      const aligned = await page.locator('[data-focus-key="settings-storage"]').evaluate(row => {
        const title = row.querySelector('strong').getBoundingClientRect()
        const value = row.querySelector('.setting-value').getBoundingClientRect()
        return value.top > title.bottom && Math.abs(value.left - title.left) < 1
      })
      assert.equal(aligned, true, 'Wrapped library name aligns below the Settings label')
    }
    await button('设置说明').tap()
    await help().waitFor()
    await button('关闭说明').tap()
    await focused(button('设置说明'))
    await page.locator('[data-focus-key="settings-storage"]').tap()
    await page.locator('.storage-page').waitFor()
    await back(page)
    await focused(page.locator('[data-focus-key="settings-storage"]'))
    await button('搜索').tap()
    await focused(hit)
    assert.equal(await search().inputValue(), '阅读')
    report.checks.push(name + ': opening a document and visiting Settings preserve the actual search result')
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), store)
    assert.deepEqual(after.documents, data.documents)
    assert.deepEqual(after.drafts, data.drafts)
    await browser.close()
    browser = undefined
  }
  assert.deepEqual(report.errors, [])
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
