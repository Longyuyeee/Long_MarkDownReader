import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { renderMobileDesignComparison } from './mobile-design-comparison.mjs'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root = 'docs/evidence/mobile-navigation-2026-10-26'
const before = JSON.parse(await readFile(`${root}/before/result.json`, 'utf8'))
const after = JSON.parse(await readFile(`${root}/final/result.json`, 'utf8'))
if (after.status !== 'passed' || after.baseline) throw new Error('Capture and verify the actual navigation task first')
const output = `${root}/comparison`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  await renderMobileDesignComparison(browser, output, {
    reference: `${root}/before/folder-after-return.png`, actual: '../final/folder-after-return.png',
    title: '回到原来的位置 · 正式手机页面前后核对',
    referenceLabel: '改造前 · 返回后筛选丢失', actualLabel: '改造后 · 保留原筛选与位置',
    description: `同一390×844应用区域：筛选“项目”，展开列表，打开第85个项目及笔记，再逐层返回。原交互滚动 ${before.folder.before.scroll}→${before.folder.after.scroll}px；改造后 ${after.folder.before.scroll}→${after.folder.after.scroll}px，保留“${after.folder.after.query}”筛选及${after.folder.after.rows}项结果。`,
    footer: '两侧都是实际移动源码构建的浏览器截图，原图不改写。沿用既有界面设计；本轮改变返回与状态恢复，不增加常驻按钮或教程。系统手势、实际输入法及进程重建另行验收。'
  })
} finally { await browser.close() }
