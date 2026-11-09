import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { renderMobileDesignComparison } from './mobile-design-comparison.mjs'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root = process.env.LONGEDIT_RECOVERY_REVIEW_OUTPUT || 'docs/evidence/mobile-recovery-continuity-2026-10-26'
const source = 'docs/design/mobile-recovery-task-v1/index.html', screens = ['list', 'save', 'export']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  if (process.argv.includes('--design-only')) {
    const output = path.join(root, 'design'); await mkdir(output, { recursive: true })
    try { await readFile(path.join(output, 'capture.json')); throw new Error('Reference already exists; choose a new output directory.') } catch (e) { if (e.code !== 'ENOENT') throw e }
    const page = await browser.newPage({ viewport: { width: 1000, height: 920 } })
    const capture = { capturedAt: new Date().toISOString(), source, sourceSha256: sha(await readFile(source)), screens: [] }
    for (const screen of screens) {
      await page.goto(pathToFileURL(path.resolve(source)).href + '?screen=' + screen)
      const file = path.join(output, screen + '.png'); await page.locator('#phone').screenshot({ path: file })
      capture.screens.push({ screen, width: 390, height: 844, sha256: sha(await readFile(file)) })
    }
    await writeFile(path.join(output, 'capture.json'), JSON.stringify(capture, null, 2) + '\n')
    console.log(JSON.stringify(capture))
  } else {
    const capture = JSON.parse(await readFile(path.join(root, 'design/capture.json'), 'utf8'))
    if (capture.sourceSha256 !== sha(await readFile(source))) throw new Error('Reference source changed')
    for (const screen of screens) {
      const reference = path.join(root, 'design', screen + '.png')
      if (capture.screens.find(item => item.screen === screen).sha256 !== sha(await readFile(reference))) throw new Error('Reference image changed')
      const output = path.join(root, 'comparison-' + screen); await mkdir(output, { recursive: true })
      await renderMobileDesignComparison(browser, output, { reference, actual: '../final/' + screen + '.png', title: 'Long编辑 · 恢复内容 · ' + screen, referenceLabel: '实现前设计 · 390 × 844', actualLabel: '生产构建 · 实际操作', description: '原设计保留，右侧由真实恢复任务采集。', footer: '核对含边线65px返回栏、16px边距、资料卡、版本切换、必要写入状态、只读内容和48px操作。记录数量、时间和真实内容以测试夹具为准；解释集中在可点击问号。' })
    }
    console.log(JSON.stringify({ root, comparisons: screens.length }))
  }
} finally { await browser.close() }
