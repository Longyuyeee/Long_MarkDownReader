import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v110-vditor-empty-preview'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch()
const errors = [], checks = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/library-shell-browser.html')
  await page.locator('.vditor-wysiwyg').getByText('让记录更顺手', { exact: true }).waitFor()
  const content = '# 空预览回归\n\n<!-- 保留这条注释 -->\n\n```js\nconst answer = 42;\n```\n\n正文保持可编辑。\n'
  await page.evaluate(content => {
    window.shellAudit.disk.set('C:/shell-fixture/会议记录.md', content)
    window.shellAudit.store.tabs[1].content = content
  }, content)
  await page.getByRole('tab', { name: '会议记录.md', exact: true }).click()
  const previews = page.locator('.vditor-wysiwyg__preview')
  await previews.nth(1).waitFor()
  for (const [theme, codeTheme] of [['white', 'github'], ['dark', 'dracula'], ['contrast', 'a11y-dark'], ['white', 'xcode']]) {
    await page.evaluate(([theme, codeTheme]) => {
      window.shellAudit.store.theme = theme
      window.shellAudit.store.codeTheme = codeTheme
    }, [theme, codeTheme])
    await page.waitForTimeout(250)
    assert.equal(await previews.first().evaluate(el => el.firstElementChild), null)
    // Empty HTML comments have no hit area: dispatch into the real Vditor
    // handler, without inserting fake preview elements or changing the source.
    await previews.first().dispatchEvent('click')
    assert.equal(await previews.first().evaluate(el => {
      const source = el.previousElementSibling
      return source.contains(document.getSelection()?.anchorNode) && getComputedStyle(source).display !== 'none'
    }), true, 'Empty preview must still reveal and select its editable source')
    await previews.nth(1).click()
    assert.equal(await previews.nth(1).evaluate(el => el.previousElementSibling.contains(document.getSelection()?.anchorNode)), true)
    checks.push(`${theme}/${codeTheme}: empty preview and ordinary code selection`)
  }
  await page.keyboard.press('End')
  await page.keyboard.type(' // edited')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForFunction(() => window.shellAudit.disk.get('C:/shell-fixture/会议记录.md').includes('// edited'))
  const saved = await page.evaluate(() => window.shellAudit.disk.get('C:/shell-fixture/会议记录.md'))
  assert.ok(saved.includes('<!-- 保留这条注释 -->'))
  assert.ok(saved.includes('正文保持可编辑。'))
  checks.push('Real code edit/save retains HTML comment and body (mocked filesystem)')
  assert.deepEqual(errors, [])
  await page.screenshot({ path: output + '/after.png', animations: 'disabled' })
  await fs.writeFile(output + '/results.json', JSON.stringify({ checks, errors, scope: 'Actual Vue/Vditor browser; mocked native IPC. Empty-preview click dispatched because it has no hit area; ordinary code clicked and edited normally.' }, null, 2) + '\n')
  console.log('Vditor empty preview regression passed')
} finally {
  await browser.close()
}
