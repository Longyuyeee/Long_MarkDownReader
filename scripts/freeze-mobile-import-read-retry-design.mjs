import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const version = process.argv.includes('--v2') ? 'v2' : 'v1'
const before = process.env.LONGEDIT_IMPORT_RETRY_BASELINE || 'docs/evidence/mobile-0.1.0/import-read-retry-before-1793182396101'
const design = 'docs/design/mobile-import-read-retry-' + version, evidence = 'docs/evidence/mobile-import-read-retry-2026-10-28'
try { await access(design); throw Error('Frozen design already exists; create a new version instead') } catch (e) { if (e.code !== 'ENOENT') throw e }
await mkdir(design, { recursive: true }); await mkdir(evidence, { recursive: true })
const css = await readFile(before + '/app.css', 'utf8') + '\n.file-import-panel button{-webkit-tap-highlight-color:transparent}\n'
await writeFile(design + '/app.css', css)
const browser = await chromium.launch({ channel: 'chrome', headless: true }), context = await browser.newContext({ viewport: { width: 390, height: 872 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }), page = await context.newPage()
const states = { 'initial-failure': 'initial-failure', 'list-recovered': 'list-recovered', 'detail-failure': 'detail-failure', 'detail-recovered': 'detail-recovered', 'cached-failure': 'list-recovered', 'dark-detail-failure': 'detail-failure', 'narrow-detail-failure': 'detail-failure' }
const files = {}, geometry = {}, sha = b => createHash('sha256').update(b).digest('hex')
try {
  for (const [name, base] of Object.entries(states)) {
    await page.setViewportSize({ width: name.startsWith('narrow') ? 320 : 390, height: name.startsWith('narrow') ? 640 : 872 })
    await page.setContent((await readFile(before + '/' + base + '.html', 'utf8')).replace(/<link[^>]*rel="stylesheet"[^>]*>/, '<style>' + css + '</style>'))
    await page.evaluate(name => {
      const panel = document.querySelector('.file-import-panel'), body = panel.firstElementChild
      const error = body.querySelector(':scope > p.recovery-error')
      if (name === 'initial-failure' || name === 'cached-failure') {
        error?.remove()
        const heading = [...panel.querySelectorAll('h3')].find(e => e.textContent === '最近导入').parentElement
        heading.querySelector('button').textContent = '重新读取记录'
        const p = document.createElement('p'); p.className = 'recovery-error'; p.setAttribute('role', 'alert'); p.textContent = (name === 'initial-failure' ? '导入记录未能读取。' : '记录未刷新，仍显示上次读取的列表。') + '读取暂时失败，请稍后重试。'; heading.after(p)
        panel.querySelector('p.subtle-message')?.remove()
      }
      if (name === 'list-recovered') error?.remove()
      if (name.endsWith('detail-failure')) {
        panel.querySelector('.sheet-hint').textContent = '记录读取失败'
        const remove = [...panel.querySelectorAll('button')].find(e => e.textContent === '移除此条导入记录')
        const retry = document.createElement('button'); retry.className = 'button full-width'; retry.textContent = '重新读取这条记录'; remove.before(retry)
      }
      if (name.startsWith('dark') || name.startsWith('narrow')) document.querySelector('.mobile-app').classList.add('theme-dark')
      if (name.startsWith('narrow')) document.documentElement.style.fontSize = '32px'
    }, name)
    const html = await page.evaluate(() => { const root = document.documentElement.cloneNode(true), style = root.querySelector('head style'), link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'app.css'; style.replaceWith(link); return '<!doctype html>' + root.outerHTML })
    const sourcePath = design + '/' + name + '.html'; await writeFile(sourcePath, html); files[sourcePath] = sha(await readFile(sourcePath))
    if (name.startsWith('narrow')) await page.getByRole('button', { name: '重新读取这条记录', exact: true }).scrollIntoViewIfNeeded()
    const top = Math.max(0, Math.floor(Math.min((await page.locator('.preview-ribbon').boundingBox()).height, (await page.locator('.bottom-sheet').boundingBox()).y))), viewport = page.viewportSize()
    const pngPath = evidence + '/design-' + version + '-' + name + '.png'; await page.screenshot({ path: pngPath, clip: { x: 0, y: top, width: viewport.width, height: viewport.height - top } }); files[pngPath] = sha(await readFile(pngPath))
    geometry[name] = await page.locator('.bottom-sheet').evaluate((root, top) => [...root.querySelectorAll('h2,h3,p,button,textarea')].filter(e => e.checkVisibility() && !e.closest('[inert]')).map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { tag: e.tagName, name: e.getAttribute('aria-label') || e.textContent.trim(), x: r.x, y: r.y - top, width: r.width, height: r.height, fontSize: s.fontSize, lineHeight: s.lineHeight, color: s.color, fontFamily: s.fontFamily } }), top)
  }
  files[design + '/app.css'] = sha(await readFile(design + '/app.css'))
  await writeFile(evidence + '/design-freeze-' + version + '.json', JSON.stringify({ frozenAt: new Date().toISOString(), runtimeHead: 'af65ae76b', baseline: before, states, files, geometry, interaction: ['读取失败不显示为空；失败刷新保留上次列表并注明', '列表重读只清理本次列表错误', '记录读取失败原地重读同一ID；禁止保存不可用内容', '重读不自动导入或写源文件；确认后才存入', '返回先退出确认，再回同一列表记录与位置', '格式错误与中断记录不伪装为临时读取错误', '普通说明继续留在问号；错误与有效状态就地保留', '取消选择不产生新记录'] }, null, 2))
  console.log(JSON.stringify({ design, evidence, states: Object.keys(states) }, null, 2))
} finally { await browser.close() }
