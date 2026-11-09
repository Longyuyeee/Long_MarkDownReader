import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { renderMobileDesignComparison } from './mobile-design-comparison.mjs'

const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root = process.argv[2] || 'docs/evidence/mobile-task-layers-2026-10-26'
const output = path.join(root, 'comparison')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 980 } })
  await page.goto((process.env.LONGEDIT_MOBILE_DESIGN_URL || 'http://127.0.0.1:9025/prototype/') + '?screen=record-detail')
  const phone = page.locator('#phone')
  await phone.getByRole('button', { name: /移除这条接收记录/ }).click()
  const dialog = phone.getByRole('alertdialog')
  await dialog.waitFor()
  const geometry = await dialog.evaluate(element => {
    const box = element.getBoundingClientRect(), parent = element.closest('#phone').getBoundingClientRect(), style = getComputedStyle(element)
    return { x: box.x - parent.x, y: box.y - parent.y, width: box.width, height: box.height, padding: style.padding, radius: style.borderRadius, titleSize: getComputedStyle(element.querySelector('h2')).fontSize }
  })
  await phone.screenshot({ path: path.join(output, 'design-confirmation.png') })
  await writeFile(path.join(output, 'design-geometry.json'), JSON.stringify(geometry, null, 2) + '\n')
  await page.close()
  await renderMobileDesignComparison(browser, output, {
    reference: path.join(output, 'design-confirmation.png'), actual: '../final/text-remove-confirm.png',
    title: 'Long编辑 · 确认框设计与正式页面',
    description: '左侧是既有交互原型的原样渲染，右侧是本轮生产构建的实际操作截图。',
    referenceLabel: '既有设计原型 · 接收记录确认', actualLabel: '正式页面 · 待导入文字确认',
    footer: '核对居中、两侧24px、342px宽、24px内边距、18px圆角、20px标题及48px动作。实际后果按记录状态说明，保留放在前面并默认聚焦，移除使用警示色。两侧父任务与示例文件不同；右侧顶部包含28px浏览器预览标记。原始AI参考图保持不变。'
  })
  const returning = path.join(root, 'comparison-return')
  await mkdir(returning, { recursive: true })
  await renderMobileDesignComparison(browser, returning, {
    reference: path.join(root, 'before/folder-return.png'), actual: '../final/folder-return.png',
    title: 'Long编辑 · 选择资料库后返回',
    description: '同一文字导入任务，打开资料库选择后按一次返回。',
    referenceLabel: '修改前 · 任务被关闭', actualLabel: '修改后 · 原详情继续保留',
    footer: '核对真实父任务、保留文字和焦点。此图展示返回结果，不把修改前页面当作设计参考。'
  })
  console.log(JSON.stringify({ root, geometry }, null, 2))
} finally { await browser.close() }
