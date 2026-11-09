import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const url = process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html'
const browser = await chromium.launch({ channel: 'chrome', headless: true })

try {
  for (const scenario of ['existing', 'retry-empty']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await context.addInitScript(scenario => {
      const state = window.libraryStartup = { rootCalls: 0, listCalls: 0 }
      const rootGate = new Promise((resolve, reject) => {
        state.releaseRoots = resolve
        state.failRoots = () => reject('READ_FAILED: 测试资料库暂不可用')
      })
      const listGate = new Promise(resolve => { state.releaseList = resolve })
      window.isTauri = true
      window.__TAURI_INTERNALS__ = {
        async invoke(command, { payload } = {}) {
          if (command !== 'plugin:mobile-storage|execute') return {}
          switch (payload.op) {
            case 'roots':
              state.rootCalls++
              if (state.rootCalls === 1) await rootGate
              return { roots: [{ id: 'local', name: '手机资料库', external: false, available: true, writable: true }] }
            case 'list':
              state.listCalls++
              await listGate
              return {
                entries: scenario === 'existing' ? [{ name: '已保存.md', relativePath: '已保存.md', directory: false, modified: 1, size: 15 }] : [],
                truncated: false,
              }
            case 'recent':
              return { entries: scenario === 'existing' ? [{ rootId: 'local', relativePath: '已保存.md' }] : [] }
            case 'systemAppearance':
              return { dark: false }
            case 'readPreferences':
              return { content: '', revision: '' }
            default:
              return { entries: [] }
          }
        },
      }
    }, scenario)
    try {
      const page = await context.newPage()
      const empty = page.getByRole('heading', { name: '从一条笔记开始' })
      const loading = page.getByRole('heading', { name: '正在读取资料' })
      const add = page.getByRole('button', { name: '添加资料' })
      await page.goto(url)
      await page.waitForFunction(() => window.libraryStartup.rootCalls === 1)
      assert.equal(await empty.count(), 0, 'An unresolved library must never render as empty')
      assert.equal(await add.count(), 0, 'Creation needs an initialized library')
      await loading.waitFor()
      if (scenario === 'retry-empty') {
        await page.evaluate(() => window.libraryStartup.failRoots())
        await page.getByText('测试资料库暂不可用').waitFor()
        assert.equal(await empty.count(), 0, 'A failed read must not render as empty')
        await page.getByRole('button', { name: '重新读取' }).tap()
        assert.equal(await page.evaluate(() => window.libraryStartup.rootCalls), 2)
      } else {
        await page.evaluate(() => window.libraryStartup.releaseRoots())
      }
      await page.waitForFunction(() => window.libraryStartup.listCalls === 1)
      await loading.waitFor()
      assert.equal(await empty.count(), 0)
      await page.evaluate(() => window.libraryStartup.releaseList())
      if (scenario === 'existing') {
        await page.locator('.file-row').getByText('已保存.md').waitFor()
        assert.equal(await empty.count(), 0)
      } else {
        await empty.waitFor()
        await page.getByRole('button', { name: '新建笔记' }).waitFor()
      }
      console.log(`Library startup ${scenario}: passed`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}
