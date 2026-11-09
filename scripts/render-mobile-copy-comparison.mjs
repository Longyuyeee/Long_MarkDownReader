import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { renderMobileDesignComparison } from './mobile-design-comparison.mjs'

const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const directory = 'docs/evidence/mobile-copy-2026-10-26'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [name, title] of [['library', '资料首页'], ['text-import', '文本导入'], ['search', '搜索']]) {
    const output = `${directory}/comparison-${name}`
    await mkdir(output, { recursive: true })
    await renderMobileDesignComparison(browser, output, {
      reference: `${directory}/before-1793010620082/${name}.png`, actual: `../final/${name}.png`,
      referenceCropTop: 28, comparisonHeight: 816,
      title: `${title} · 清理前后实页对比`, referenceLabel: '清理前 · 实际应用', actualLabel: '清理后 · 实际应用',
      description: '相同390px宽度、相同隔离示例资料。两侧均为正式移动端源码构建的浏览器截图。',
      footer: '删除常驻教程与版本路线图，将有用的格式、限制和行为说明收入问号。保留任务状态、读取失败、未保存输入与删除后果。历史截图包含28px预览条，此图对齐共同的390×816应用区域；原始PNG均保留。此图不表示Android原生验收。'
    })
  }
} finally { await browser.close() }
