import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { mobileAdb as adb, mobileTestPackage, connectMobileWebView } from './mobile-native-webview-cdp.mjs'

const [stage, size = 'normal'] = process.argv.slice(2)
assert.match(stage || '', /^[a-z0-9-]+$/)
assert.ok(['normal', 'large'].includes(size))
const output = `docs/evidence/mobile-0.1.0/roots-combined-v3/native/${stage}`
await mkdir(output)
const report = { size, passed: false, screens: [], checks: [] }
const font = () => adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim()
const help = '.mobile-help-dialog'
const lowerSheet = '.sheet-backdrop'
const libraryPicker = '.library-title-picker'
const searchScope = 'button[aria-label^="搜索范围："]'
const searchInput = 'input[aria-label="查找资料内容"]'
let view, originalFont

async function waitFor(fn, arg) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await view.evaluate(fn, arg)
    if (result) return result
    await delay(200)
  }
  throw Error('Timed out waiting for ' + (arg ? JSON.stringify(arg) : fn))
}

const shown = selector => waitFor(s => !!document.querySelector(s)?.getBoundingClientRect().height, selector)
const hidden = selector => waitFor(s => !document.querySelector(s)?.getBoundingClientRect().height, selector)
const focus = selector => waitFor(s => document.activeElement?.matches(s), selector)
const back = () => adb('shell', 'input', 'keyevent', '4')

async function tap(selector, label) {
  const point = await waitFor(({ selector, label }) => {
    const element = [...document.querySelectorAll(selector)].find(e =>
      !e.disabled && !e.closest('[inert]') && (!label || e.textContent.trim() === label)
    )
    if (!element) return null
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !element.contains(document.elementFromPoint(x, y))) return null
    return [Math.round(x * devicePixelRatio), Math.round(83 + y * devicePixelRatio)]
  }, { selector, label })
  adb('shell', 'input', 'tap', ...point.map(String))
}

async function shot(name) {
  await delay(400)
  const geometry = await view.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON()
    return {
      viewport: [innerWidth, innerHeight], font: getComputedStyle(document.documentElement).fontSize,
      overflow: document.documentElement.scrollWidth > innerWidth, help: rect('.mobile-help-dialog'),
      lowerSheet: rect('.sheet-backdrop'), navigation: rect('.bottom-navigation')
    }
  })
  assert.equal(geometry.overflow, false)
  assert.equal(geometry.font, size === 'large' ? '32px' : '16px')
  await writeFile(`${output}/${name}.png`, adb('exec-out', 'screencap', '-p'))
  report.screens.push({ name, ...geometry })
}

async function reviewHelp(name, trigger, opener) {
  await tap(trigger)
  await shown(lowerSheet)
  await tap(opener)
  await shown(help)
  await hidden(lowerSheet)
  await shot(name)
  back()
  await shown(lowerSheet)
  await focus(opener)
  back()
  await hidden(lowerSheet)
  await focus(trigger)
}

try {
  assert.equal(adb('emu', 'avd', 'name').toString().split('\n')[0].trim(), 'LongEdit_Compat_API29')
  assert.match(adb('shell', 'wm', 'size').toString(), /Physical size: 1080x2280/)
  assert.match(adb('shell', 'wm', 'density').toString(), /Physical density: 440/)
  originalFont = font()
  if (size === 'large') {
    adb('shell', 'settings', 'put', 'system', 'font_scale', '2.0')
    await delay(900)
    assert.equal(font(), '2.0')
  }
  adb('shell', 'am', 'force-stop', mobileTestPackage)
  adb('shell', 'am', 'start', '-W', '-n', `${mobileTestPackage}/.MainActivity`)
  for (let i = 0; i < 30; i++) {
    try { view = await connectMobileWebView(); break }
    catch (error) { if (i === 29) throw error; await delay(250) }
  }
  await shown('.phone-library')
  await shown('.file-row')
  await shot('library')
  await reviewHelp('library-help', libraryPicker, '[aria-label="文件夹授权说明"]')
  report.checks.push('Library help shows one layer and Back restores both openers')

  await tap('button', '搜索')
  await tap(searchInput)
  await shown('.root-ime')
  await delay(650)
  assert.equal(await view.evaluate(s => document.activeElement?.matches(s) && !!document.querySelector('.root-ime'), searchInput), true,
    'The first tap keeps the field focused after the asynchronous search initialization')
  await hidden('.bottom-navigation')
  adb('shell', 'input', 'text', 'MobileNavigation')
  await waitFor(s => document.querySelector(s)?.value === 'MobileNavigation', searchInput)
  const ime = adb('shell', 'dumpsys', 'input_method').toString()
  assert.match(ime, /mInputShown=true|mIsInputViewShown=true/)
  await shot('search-keyboard')
  back()
  await shown('.bottom-navigation')
  await shown('.search-result')
  await shot('search')
  await reviewHelp('search-help', searchScope, '[aria-label="搜索说明"]')
  assert.equal(await view.evaluate(s => document.querySelector(s).value, searchInput), 'MobileNavigation')
  report.checks.push('Native keyboard Back preserves the search, then help and scope each return one layer')

  await tap('button', '设置')
  await shown('.settings-home')
  await shot('settings')
  await tap('[data-focus-key="settings-storage"]')
  await shown('.storage-page')
  back()
  await focus('[data-focus-key="settings-storage"]')
  await tap('button', '搜索')
  await shown('.search-result')
  assert.equal(await view.evaluate(s => document.querySelector(s).value, searchInput), 'MobileNavigation')
  report.checks.push('Settings child and tab navigation preserve the search results')
  report.passed = true
} catch (error) {
  report.failure = String(error.stack || error)
  await writeFile(output + '/failure.png', adb('exec-out', 'screencap', '-p'))
  process.exitCode = 1
} finally {
  view?.close()
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
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({ passed: report.passed, screens: report.screens.length, checks: report.checks.length, failure: report.failure }))
