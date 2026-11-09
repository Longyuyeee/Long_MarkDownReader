import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { renderMobileDesignComparison } from './mobile-design-comparison.mjs'

const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root = process.env.LONGEDIT_EXPORT_REVIEW_OUTPUT || 'docs/evidence/mobile-export-continuity-2026-10-26'
const source = 'docs/design/mobile-export-task-v1/index.html'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const screens = ['preview', 'manifest', 'history', 'detail', 'confirm']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
try {
  if (process.argv.includes('--design-only')) {
    const output = path.join(root, 'design'); await mkdir(output, { recursive: true })
    let previous = false
    try { await readFile(path.join(output, 'capture.json')); previous = true } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (previous) throw new Error('This design capture already exists. Set LONGEDIT_EXPORT_REVIEW_OUTPUT to a new directory to retain the original reference.')
    const page = await browser.newPage({ viewport: { width: 1000, height: 920 } })
    const capture = { capturedAt: new Date().toISOString(), source, sourceSha256: sha(await readFile(source)), screens: [] }
    for (const screen of screens) {
      await page.goto(pathToFileURL(path.resolve(source)).href + '?screen=' + screen)
      const file = path.join(output, screen + '.png')
      await page.locator('#phone').screenshot({ path: file })
      capture.screens.push({ screen, width: 390, height: 844, sha256: sha(await readFile(file)) })
    }
    await writeFile(path.join(output, 'capture.json'), JSON.stringify(capture, null, 2) + '\n')
    await page.close(); console.log(JSON.stringify(capture, null, 2))
  } else {
    const capture = JSON.parse(await readFile(path.join(root, 'design/capture.json'), 'utf8'))
    assertReference(capture.sourceSha256 === sha(await readFile(source)))
    const actual = { preview: 'preview', manifest: 'manifest', history: 'history', detail: 'detail', confirm: 'remove-confirm' }
    for (const screen of screens) {
      const reference = path.join(root, 'design', screen + '.png')
      assertReference(capture.screens.find(item => item.screen === screen).sha256 === sha(await readFile(reference)))
      const output = path.join(root, 'comparison-' + screen); await mkdir(output, { recursive: true })
      await renderMobileDesignComparison(browser, output, {
        reference, actual: '../final/' + actual[screen] + '.png',
        title: 'Long编辑 · 附件包导出 · ' + ({ preview: '导出', manifest: '附件清单', history: '记录', detail: '详情', confirm: '移除确认' }[screen]),
        referenceLabel: '先行设计 · 390 × 844', actualLabel: '正式页面 · 实际操作',
        description: '设计在实现前采集，保留原图和哈希；右侧来自生产构建。',
        footer: '核对64px任务栏、16px内容边距、文件卡、独立清单/详情、固定操作及48px按钮。实际元数据、错误和时间以真实记录为准；浏览器动作写作下载，Android动作写作选择位置。确认框覆盖原详情并默认聚焦保留；不重画参考图消除差异。'
      })
    }
    console.log(JSON.stringify({ root, comparisons: screens.length }))
  }
} finally { await browser.close() }
function assertReference(condition) { if (!condition) throw new Error('Design reference changed after capture; preserve and review the original reference.') }
