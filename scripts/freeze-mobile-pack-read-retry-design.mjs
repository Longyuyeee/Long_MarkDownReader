import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const before = 'docs/evidence/mobile-0.1.0/pack-read-retry-before-design-2026-10-28', design = 'docs/design/mobile-pack-read-retry-v1', evidence = 'docs/evidence/mobile-pack-read-retry-2026-10-28'
try { await access(design); throw Error('Frozen design exists; create a new version') } catch (e) { if (e.code !== 'ENOENT') throw e }
await mkdir(design, { recursive: true }); await mkdir(evidence, { recursive: true })
const css = await readFile(before + '/app.css', 'utf8') + '\n.pack-import-panel button{-webkit-tap-highlight-color:transparent}\n'
await writeFile(design + '/app.css', css)
const states = { 'initial-failure': 'initial-failure', 'list-recovered': 'list-recovered', 'detail-failure': 'detail-failure', 'detail-recovered': 'detail-recovered', 'package-unavailable': 'package-unavailable', 'removal-warning': 'removal-warning', 'cached-failure': 'list-recovered', 'dark-detail-failure': 'detail-failure', 'narrow-detail-failure': 'detail-failure' }
const files = {}, geometry = {}, sha = b => createHash('sha256').update(b).digest('hex')
const browser = await chromium.launch({ channel: 'chrome', headless: true }), page = await browser.newPage({ viewport: { width: 390, height: 872 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
try {
  for (const [name, base] of Object.entries(states)) {
    await page.setViewportSize({ width: name.startsWith('narrow') ? 320 : 390, height: name.startsWith('narrow') ? 640 : 872 })
    await page.setContent((await readFile(before + '/' + base + '.html', 'utf8')).replace(/<link[^>]*rel="stylesheet"[^>]*>/, '<style>' + css + '</style>'))
    await page.evaluate(name => {
      const panel = document.querySelector('.pack-import-panel'), body = panel.firstElementChild
      if (name === 'initial-failure' || name === 'cached-failure') {
        const heading = [...panel.querySelectorAll('h3')].find(e => e.textContent === '附件包导入记录').parentElement
        heading.querySelector('button').textContent = '重新读取导入记录'
        const old = body.querySelector(':scope > p.recovery-error'), p = old ? old.cloneNode(true) : document.createElement('p')
        old?.remove(); p.className = 'recovery-error'; p.setAttribute('role', 'alert'); p.textContent = (name === 'initial-failure' ? '导入记录未能读取。' : '记录未刷新，仍显示上次读取的列表。') + '附件包暂时无法读取，请重试。'; heading.after(p)
        if (name === 'initial-failure') [...panel.querySelectorAll('p')].find(e => e.textContent === '暂无导入记录。')?.remove()
      }
      if (name.endsWith('detail-failure') || name === 'package-unavailable') {
        const status = body.querySelector('p.sheet-hint'); status.textContent = status.textContent.replace('导入尚未完成', '附件包读取失败')
        const remove = [...body.querySelectorAll('button')].find(e => e.textContent === '移除这份导入记录'), retry = remove.cloneNode(false)
        retry.className = 'button full-width'; retry.textContent = '重新读取这份附件包'; remove.before(retry)
      }
      if (name === 'removal-warning') panel.querySelector('[aria-label="确认移除附件包导入记录"] p').textContent = '记录内容暂时无法读取。移除后，其中可能尚未存入的正文和附件也会移除。源文件和已存入的笔记、附件继续保留。'
      if (name.startsWith('dark') || name.startsWith('narrow')) document.querySelector('.mobile-app').classList.add('theme-dark')
      if (name.startsWith('narrow')) document.documentElement.style.fontSize = '32px'
    }, name)
    const html = await page.evaluate(() => { const root = document.documentElement.cloneNode(true), style = root.querySelector('head style'), link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'app.css'; style.replaceWith(link); return '<!doctype html>' + root.outerHTML })
    const source = design + '/' + name + '.html'; await writeFile(source, html); files[source] = sha(await readFile(source))
    if (name.startsWith('narrow')) await page.getByRole('button', { name: '重新读取这份附件包', exact: true }).scrollIntoViewIfNeeded()
    const top = name === 'removal-warning' ? 0 : Math.max(0, Math.floor(Math.min((await page.locator('.preview-ribbon').boundingBox()).height, (await page.locator('.bottom-sheet').boundingBox()).y))), v = page.viewportSize()
    const png = evidence + '/design-v1-' + name + '.png'; await page.screenshot({ path: png, clip: { x: 0, y: top, width: v.width, height: v.height - top } }); files[png] = sha(await readFile(png))
    geometry[name] = await page.locator('.bottom-sheet').evaluate((root, top) => [...root.querySelectorAll('h2,h3,h4,p,button,textarea,li')].filter(e => e.checkVisibility() && !e.closest('[inert]')).map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { tag: e.tagName, name: e.getAttribute('aria-label') || (e.tagName === 'TEXTAREA' ? e.value.trim() : e.textContent.trim()), x: r.x, y: r.y - top, width: r.width, height: r.height, fontSize: s.fontSize, lineHeight: s.lineHeight, color: s.color, fontFamily: s.fontFamily } }), top)
  }
  files[design + '/app.css'] = sha(await readFile(design + '/app.css'))
  await writeFile(evidence + '/design-freeze-v1.json', JSON.stringify({ frozenAt: new Date().toISOString(), runtimeHead: '09e99b9f5', baseline: before, files, geometry, states, interaction: ['失败不显示为空；失败刷新保留旧列表并注明', '适配器抛出错误与返回failed详情分别识别，重读沿用同一ID', '保存过的导入失败不冒充临时读取失败；不自动存入或重新选择', '重试等待时保留按钮并禁用，消费Back，阻止重复请求', '包内预览、确认和详情逐层返回，保留同一包与列表现场', '内容未知时移除明确提醒可能丢失尚未存入的正文及附件', '错误就地呈现；通用解释留在问号', '短屏可以滚动，保留原始大字尺寸及真实焦点'] }, null, 2))
  console.log(JSON.stringify({ design, states: Object.keys(states) }, null, 2))
} finally { await browser.close() }
