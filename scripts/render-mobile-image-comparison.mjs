import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { renderMobileDesignComparison } from './mobile-design-comparison.mjs'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root = process.env.LONGEDIT_IMAGE_REVIEW_OUTPUT || 'docs/evidence/mobile-image-continuity-2026-10-26'
const source = 'docs/design/mobile-image-task-v1/index.html', screens = ['compose', 'references', 'replace', 'history', 'detail']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  if (process.argv.includes('--design-only')) {
    const output = path.join(root, 'design'); await mkdir(output, { recursive: true })
    try { await readFile(path.join(output, 'capture.json')); throw new Error('Reference already captured; use a new output folder.') } catch (e) { if (e.code !== 'ENOENT') throw e }
    const page = await browser.newPage({ viewport: { width: 1000, height: 920 } })
    const capture = { capturedAt: new Date().toISOString(), source, sourceSha256: sha(await readFile(source)), assetSha256: sha(await readFile('docs/design/mobile-image-task-v1/image.png')), screens: [] }
    for (const screen of screens) {
      await page.goto(pathToFileURL(path.resolve(source)).href + '?screen=' + screen)
      const file = path.join(output, screen + '.png'); await page.locator('#phone').screenshot({ path: file })
      capture.screens.push({ screen, width: 390, height: 844, sha256: sha(await readFile(file)) })
    }
    await writeFile(path.join(output, 'capture.json'), JSON.stringify(capture, null, 2) + '\n')
    console.log(JSON.stringify(capture))
  } else {
    const capture = JSON.parse(await readFile(path.join(root, 'design/capture.json'), 'utf8'))
    if (capture.sourceSha256 !== sha(await readFile(source)) || capture.assetSha256 !== sha(await readFile('docs/design/mobile-image-task-v1/image.png'))) throw new Error('Reference source changed')
    for (const screen of screens) {
      const reference = path.join(root, 'design', screen + '.png')
      if (capture.screens.find(s => s.screen === screen).sha256 !== sha(await readFile(reference))) throw new Error('Reference image changed')
      const output = path.join(root, 'comparison-' + screen); await mkdir(output, { recursive: true })
      await renderMobileDesignComparison(browser, output, { reference, actual: '../final/' + screen + '.png', title: 'Long编辑 · 图片任务 · ' + screen, referenceLabel: '实现前设计 · 390 × 844', actualLabel: '生产构建 · 真实点按', description: '保留原设计，核对实际任务页面与返回路径。', footer: '核对64px任务栏、16px边距、独立引用/历史、224px图片区域和48px确认动作。正式页使用实际状态与文件信息；选择图片后仍需确认插入，取消保留已生成的图片记录。' })
    }
    console.log(JSON.stringify({ root, comparisons: screens.length }))
  }
} finally { await browser.close() }
