// Follow up axe's incomplete contrast check on the real narrow production task.
import assert from 'node:assert/strict'
import { readFile, writeFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { activateMobileRoot, openMobileSettingsTransfer } from './mobile-settings-navigation.mjs'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/mobile-pack-read-retry-2026-10-28/contrast-followup.json'
try { await access(output); throw Error('Follow-up evidence exists; use a new version') } catch (e) { if (e.code !== 'ENOENT') throw e }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 872 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const key = 'longedit-mobile-preview-v1'
    localStorage.setItem(key, JSON.stringify({ version: 1, documents: {}, drafts: {}, packImports: { 'same-package': { id: 'same-package', name: '旅行笔记.textpack', created: 1793152800000, bytes: 947, status: 'ready', readable: true, count: 3, content: null, assets: [], textName: 'text.markdown', archiveDigest: '', error: '', localPath: null } } }))
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (k) { if (k === key && /\.packImport\s*\(/.test(new Error().stack || '')) throw Error('READ_FAILED: 附件包暂时无法读取，请重试。'); return get.call(this, k) }
  })
  await page.goto('http://127.0.0.1:9012/mobile.html'); await page.getByRole('button', { name: '切换深色', exact: true }).tap(); await activateMobileRoot(page, '设置'); await openMobileSettingsTransfer(page, '附件包导入记录'); await page.locator('[data-pack-import-id="same-package"]').tap()
  const retry = page.getByRole('button', { name: '重新读取这份附件包', exact: true }); await retry.waitFor(); await page.setViewportSize({ width: 320, height: 640 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px' }); await retry.scrollIntoViewIfNeeded()
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const result = await page.evaluate(async () => {
    const r = await axe.run(document, { iframes: false, runOnly: { type: 'rule', values: ['color-contrast'] } })
    const rgb = value => value.match(/[\d.]+/g).map(Number), lum = c => c.slice(0, 3).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0)
    const describe = e => {
      const s = getComputedStyle(e), foreground = rgb(s.color); let parent = e, background
      while (parent) { const color = rgb(getComputedStyle(parent).backgroundColor); if (color.length < 4 || color[3] === 1) { background = color; break }; parent = parent.parentElement }
      const rect = e.getBoundingClientRect(), ratio = background ? (Math.max(lum(foreground), lum(background)) + .05) / (Math.min(lum(foreground), lum(background)) + .05) : null
      return { name: e.getAttribute('aria-label') || e.textContent.trim(), color: s.color, background: parent ? getComputedStyle(parent).backgroundColor : null, contrastRatio: ratio, fontSize: s.fontSize, fontWeight: s.fontWeight, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
    }
    return { violations: r.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: r.incomplete.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary, actual: n.target.length === 1 ? describe(document.querySelector(n.target[0])) : null })) })), visibleText: [...document.querySelectorAll('.bottom-sheet h2,.bottom-sheet h3,.bottom-sheet p,.bottom-sheet button')].filter(e => e.checkVisibility() && !e.closest('[inert]')).map(describe) }
  })
  assert.deepEqual(result.violations, [])
  for (const check of result.incomplete) for (const node of check.nodes) { assert.ok(node.actual); assert.ok(node.actual.contrastRatio >= 4.5) }
  await writeFile(output, JSON.stringify({ scope: 'Real production task, same 320px dark 200% state; ratios from actual foreground and nearest opaque background. Clipped text remains scrollable; this does not change the original incomplete axe result.', nativeAndroidTest: false, ...result }, null, 2))
  console.log(JSON.stringify({ output, incomplete: result.incomplete, violations: result.violations }, null, 2))
} finally { await browser.close() }
