import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { mobileAdb as adb, mobileTestPackage, connectMobileWebView } from './mobile-native-webview-cdp.mjs'

const [stage, size = 'normal'] = process.argv.slice(2)
assert.match(stage || '', /^[a-z0-9-]+$/)
assert.ok(['normal', 'large'].includes(size))
const root = process.env.LONGEDIT_SETTINGS_FINISH_NATIVE_OUTPUT || 'docs/evidence/mobile-0.1.0/settings-finish-v3-2026-11-07/native'
const output = `${root}/${stage}`
const foundationVersion = JSON.parse(await readFile('package.json', 'utf8')).version
await mkdir(output)
const report = { size, passed: false, checks: [], screens: [] }
const fixtureId = 'e9fee6a6-2457-4858-a1ea-c49bf61560ff'
const targetFile = `MobileNavigation-接收-${fixtureId}.pdf`
const help = '.mobile-help-dialog'
const grip = '.mobile-help-grip'
const opener = 'button[aria-label="PDF阅读说明"]'
const setting = id => `[data-focus-key="settings-${id}"]`
const font = () => adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim()
let webview
let originalFont

async function waitFor(fn, arg) {
  for (let i = 0; i < 90; i++) {
    const result = await webview.evaluate(fn, arg)
    if (result) return result
    await delay(200)
  }
  throw Error('Timed out waiting for ' + (arg ? JSON.stringify(arg) : fn))
}

const present = selector => waitFor(s => !!document.querySelector(s)?.getBoundingClientRect().height, selector)
const absent = selector => waitFor(s => !document.querySelector(s)?.getBoundingClientRect().height, selector)
const focus = selector => waitFor(s => document.activeElement?.matches(s), selector)
const back = () => adb('shell', 'input', 'keyevent', '4')

async function point(selector, label) {
  return waitFor(({ selector, label }) => {
    const element = [...document.querySelectorAll(selector)].find(e =>
      !e.disabled && !e.closest('[inert]') &&
      (!label || e.textContent.trim() === label || e.querySelector('strong')?.textContent.trim() === label)
    )
    if (!element) return null
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !element.contains(document.elementFromPoint(x, y))) return null
    return { x: Math.round(x * devicePixelRatio), y: Math.round(83 + y * devicePixelRatio), ratio: devicePixelRatio }
  }, { selector, label })
}

async function tap(selector, label) {
  const { x, y } = await point(selector, label)
  adb('shell', 'input', 'tap', String(x), String(y))
}

async function capture(name, selector) {
  await present(selector)
  await delay(450)
  const geometry = await webview.evaluate(s => ({
    viewport: [innerWidth, innerHeight], font: getComputedStyle(document.documentElement).fontSize,
    overflow: document.documentElement.scrollWidth > innerWidth,
    rect: document.querySelector(s).getBoundingClientRect().toJSON()
  }), selector)
  assert.equal(geometry.overflow, false)
  await writeFile(`${output}/${name}.png`, adb('exec-out', 'screencap', '-p'))
  report.screens.push({ name, ...geometry })
}

try {
  assert.equal(adb('emu', 'avd', 'name').toString().split('\n')[0].trim(), 'LongEdit_Compat_API29')
  assert.match(adb('shell', 'wm', 'size').toString(), /Physical size: 1080x2280/)
  assert.match(adb('shell', 'wm', 'density').toString(), /Physical density: 440/)
  originalFont = font()
  if (size === 'large') {
    adb('shell', 'settings', 'put', 'system', 'font_scale', '2.0')
    await delay(1000)
    assert.equal(font(), '2.0')
  }
  adb('shell', 'am', 'force-stop', mobileTestPackage)
  adb('shell', 'am', 'start', '-W', '-n', `${mobileTestPackage}/.MainActivity`)
  for (let i = 0; i < 30; i++) {
    try { webview = await connectMobileWebView(); break }
    catch (error) { if (i === 29) throw error; await delay(250) }
  }
  await present('.phone-library')
  await tap('button', '设置')
  await present('.settings-home')
  await tap(setting('transfers'))
  await capture('transfers', '.transfers-page')
  for (const id of ['text', 'pdf', 'image', 'pack-import', 'pack-export']) {
    const row = setting(`transfer-${id}`)
    await tap(row)
    await present('.bottom-sheet')
    await waitFor(() => document.querySelector('.sheet-heading .icon-button')?.disabled === false)
    back()
    await absent('.bottom-sheet')
    await focus(row)
  }
  back()
  await focus(setting('transfers'))
  report.checks.push('All five record entries return to the correct row, then to Settings')

  await tap(setting('about'))
  await capture('about', '.settings-about')
  const about = await webview.evaluate(() => document.querySelector('.settings-about').innerText)
  assert.ok(about.includes('基础引擎 ' + foundationVersion))
  assert.ok(about.includes('Android 开发版'))
  back()
  await focus(setting('about'))
  report.checks.push('About shows the packaged Android label and Back restores its entry')

  await tap('.settings-home .mobile-help-trigger')
  await capture('settings-help', help)
  back()
  await absent(help)
  await focus('.settings-home .mobile-help-trigger')
  report.checks.push('The Settings question mark opens and closes the shared help')

  await tap('button', '资料')
  await present('.phone-library')
  await tap('button[aria-label="查找文件名"]')
  await present('input[aria-label="按文件名查找"]')
  const query = fixtureId.slice(0, 8)
  adb('shell', 'input', 'text', query)
  await waitFor(query => document.querySelector('input[aria-label="按文件名查找"]')?.value === query, query)
  adb('shell', 'input', 'keyevent', '66')
  await tap('.file-row', targetFile)
  await waitFor(() => document.querySelector('.textLayer span') && !document.querySelector('.pdf-render-status'))
  await tap('.pdf-menu-opener')
  await tap(opener)
  await capture('pdf-help', help)
  await absent('.pdf-action-layer')
  const body = await point('.mobile-help-content')
  const bodyHeight = await webview.evaluate(() => document.querySelector('.mobile-help-content').clientHeight)
  const travel = Math.round(Math.min(120, bodyHeight * .36) * body.ratio)
  let reachedEnd = false
  for (let swipe = 0; swipe < 8 && !reachedEnd; swipe++) {
    adb('shell', 'input', 'swipe', String(body.x), String(body.y + travel),
      String(body.x), String(body.y - travel), '400')
    await delay(250)
    reachedEnd = await webview.evaluate(() => {
      const content = document.querySelector('.mobile-help-content')
      return content.scrollTop > 0 && content.scrollHeight - content.clientHeight - content.scrollTop < 2
    })
  }
  assert.ok(reachedEnd, 'Android touch scroll reaches the last help paragraph')
  await capture('pdf-help-end', help)
  await present(help)
  const { x, y, ratio } = await point(grip)
  adb('shell', 'input', 'swipe', String(x), String(y), String(x), String(y + Math.round(90 * ratio)), '450')
  await absent(help)
  await focus(opener)
  await tap(opener)
  await present(help)
  back()
  await absent(help)
  await focus(opener)
  back()
  await absent('.pdf-action-layer')
  await present('.mobile-pdf')
  back()
  await present('.phone-library')
  report.checks.push('Physical Back and a touch drag restore the PDF menu, then Back returns to the PDF and the library')
  report.passed = true
} catch (error) {
  report.failure = String(error.stack || error)
  await writeFile(`${output}/failure.png`, adb('exec-out', 'screencap', '-p'))
  process.exitCode = 1
} finally {
  webview?.close()
  if (size === 'large' && originalFont !== undefined) {
    for (let i = 0; i < 3; i++) {
      if (originalFont === 'null') adb('shell', 'settings', 'delete', 'system', 'font_scale')
      else adb('shell', 'settings', 'put', 'system', 'font_scale', originalFont)
      await delay(900)
      if (font() === originalFont) break
    }
    report.fontRestored = font() === originalFont
    if (!report.fontRestored) { report.passed = false; process.exitCode = 1 }
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screens: report.screens.length, failure: report.failure }))
