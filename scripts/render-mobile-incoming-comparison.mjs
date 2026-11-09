import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { renderMobileDesignComparison } from './mobile-design-comparison.mjs'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root = process.env.LONGEDIT_INCOMING_REVIEW_OUTPUT || 'docs/evidence/mobile-incoming-continuity-2026-10-26'
const source = 'docs/design/mobile-incoming-task-v1/index.html', screens = ['list', 'text', 'error']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  if (process.argv.includes('--design-only')) {
    const output = path.join(root, 'design'); await mkdir(output, { recursive: true })
    try { await readFile(path.join(output, 'capture.json')); throw new Error('Reference already captured; use a new output folder.') } catch (e) { if (e.code !== 'ENOENT') throw e }
    const page = await browser.newPage({ viewport: { width: 1000, height: 920 } })
    const capture = { capturedAt: new Date().toISOString(), source, sourceSha256: sha(await readFile(source)), screens: [] }
    for (const screen of screens) {
      await page.goto(pathToFileURL(path.resolve(source)).href + '?screen=' + screen)
      const file = path.join(output, screen + '.png'); await page.locator('#phone').screenshot({ path: file })
      capture.screens.push({ screen, width: 390, height: 844, sha256: sha(await readFile(file)) })
    }
    await writeFile(path.join(output, 'capture.json'), JSON.stringify(capture, null, 2) + '\n'); console.log(JSON.stringify(capture))
  } else {
    const capture = JSON.parse(await readFile(path.join(root, 'design/capture.json'), 'utf8'))
    if (capture.sourceSha256 !== sha(await readFile(source))) throw new Error('Reference source changed')
    const actual = JSON.parse(await readFile(path.join(root, 'final/report.json'), 'utf8')), alignment = []
    for (const screen of screens) {
      const reference = path.join(root, 'design', screen + '.png')
      if (capture.screens.find(s => s.screen === screen).sha256 !== sha(await readFile(reference))) throw new Error('Reference image changed')
      const output = path.join(root, 'comparison-' + screen); await mkdir(output, { recursive: true })
      await renderMobileDesignComparison(browser, output, { reference, actual: '../final/' + screen + '.png', title: 'Long编辑 · 收到的内容 · ' + screen, referenceLabel: '实现前设计 · 390 × 844', actualLabel: '生产构建 · 实际操作', description: '保留原设计图，核对列表、单项核对与接收失败页面。', footer: '核对64px任务栏、16px边距、48px操作、独立核对页面。实际文件状态和附加测试项以生产页为准；返回应接回原编辑现场，确认存入并打开后才切换文档。' })
      const page = await browser.newPage({ viewport: { width: 1000, height: 920 } })
      try {
        await page.goto(pathToFileURL(path.resolve(source)).href + '?screen=' + screen)
        const design = await page.evaluate(() => { const phone = document.querySelector('#phone').getBoundingClientRect(); const box = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x: r.x - phone.x, y: r.y - phone.y, width: r.width, height: r.height } : null }; return { header: box('.header'), title: box('.header h1'), text: box('textarea'), primary: box('.action') } })
        const real = actual.geometry[screen]
        alignment.push({ screen, design, actual: real, textTopDifferencePx: real.text ? real.text.y - design.text.y : null, checked: 'Header height/title x, textarea width/height/x, and primary action height/x match the frozen design.', remaining: 'SVG glyphs replace character symbols; text line metrics and removal-row spacing still differ slightly.' })
        if (design.header.height !== real.header.height || design.title.x !== real.title.x || (real.text && (design.text.width !== real.text.width || design.text.height !== real.text.height || design.text.x !== real.text.x)) || (real.primary && (design.primary.height !== real.primary.height || design.primary.x !== real.primary.x))) throw new Error('Task geometry differs from frozen design: ' + screen)
      } finally { await page.close() }
    }
    await writeFile(path.join(root, 'alignment.json'), JSON.stringify(alignment, null, 2) + '\n')
    console.log(JSON.stringify({ root, comparisons: screens.length }))
  }
} finally { await browser.close() }
