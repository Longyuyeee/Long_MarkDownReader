import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v110-tooltip-fade'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch(), errors = [], checks = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  await page.getByTestId('library-create-menu').waitFor()
  await page.evaluate(async () => {
    const { installAppTooltipPolicy } = await import('/src/services/appTooltipPolicy.ts')
    window.removeFadePolicy = installAppTooltipPolicy()
  })
  const trigger = page.getByTestId('library-create-menu')
  const tooltip = page.locator('#longedit-app-tooltip')
  for (const [motion, keyboard] of [['calm', false], ['swift', false], ['expressive', false], ['calm', true]]) {
    await page.evaluate(motion => { window.workflowAudit.store.motionSpeed = motion }, motion)
    await page.waitForFunction(motion => document.body.dataset.motion === motion, motion)
    await page.mouse.move(900, 600)
    if (keyboard) await trigger.focus()
    else await trigger.hover()
    await page.waitForFunction(() => {
      const el = document.querySelector('#longedit-app-tooltip')
      return el.dataset.visible === 'true' && Number(getComputedStyle(el).opacity) > .999
    })
    if (motion === 'calm' && !keyboard) await page.screenshot({ path: output + '/hover.png', animations: 'disabled' })
    await page.evaluate(eventType => {
      window.fadeFrames = []; window.fadeDone = false
      document.addEventListener(eventType, () => {
        const start = performance.now()
        const sample = now => {
          const el = document.querySelector('#longedit-app-tooltip'), style = getComputedStyle(el)
          window.fadeFrames.push({ ms: Math.round(now - start), opacity: Number(style.opacity), visibility: style.visibility, popup: document.body.dataset.appPopupOpen })
          if (now - start < 250) requestAnimationFrame(sample)
          else window.fadeDone = true
        }
        requestAnimationFrame(sample)
      }, { once: true, capture: true })
    }, keyboard ? 'keydown' : 'pointerdown')
    if (keyboard) await page.keyboard.press('Enter')
    else await trigger.click()
    await page.locator('.library-create-dropdown-menu').waitFor()
    await page.waitForFunction(() => window.fadeDone)
    const frames = await page.evaluate(() => window.fadeFrames)
    assert.ok(frames.some(frame => frame.opacity > .01 && frame.opacity < .99), 'Dismissal must include intermediate opacity, not jump straight to zero')
    assert.equal(frames.at(-1).opacity, 0)
    assert.equal(frames.at(-1).visibility, 'hidden')
    for (let i = 1; i < frames.length; i++) assert.ok(frames[i].opacity <= frames[i - 1].opacity + .002, 'Tooltip must fade without reappearing')
    assert.equal(await tooltip.getAttribute('aria-hidden'), 'true')
    await trigger.hover()
    await page.waitForTimeout(500)
    assert.equal(await tooltip.getAttribute('data-visible'), 'false')
    const option = page.locator('.library-create-dropdown-menu .n-dropdown-option').first()
    assert.equal(await option.evaluate(el => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
    }), true, 'Menu option stays clickable during/after the fade')
    checks.push({ motion, keyboard, frames })
    if (motion === 'calm' && !keyboard) await page.screenshot({ path: output + '/menu.png', animations: 'disabled' })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.body.dataset.appPopupOpen === 'false')
    await trigger.evaluate(el => el.blur())
  }
  // The OS reduced-motion preference must override even a normal app setting.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(900, 600); await trigger.hover()
  await page.waitForFunction(() => document.querySelector('#longedit-app-tooltip').dataset.visible === 'true')
  await trigger.click()
  await page.locator('.library-create-dropdown-menu').waitFor()
  assert.equal(await tooltip.evaluate(el => getComputedStyle(el).opacity), '0')
  assert.equal(await tooltip.evaluate(el => getComputedStyle(el).visibility), 'hidden')
  checks.push({ reducedMotion: true, immediate: true })
  assert.deepEqual(errors, [])
  await fs.writeFile(output + '/results.json', JSON.stringify({ checks, errors, scope: 'Actual App/dropdown/tooltip policy with browser pointer and keyboard input; mocked native IPC. Per-frame computed opacity, no CSS or event outcome mocking.' }, null, 2) + '\n')
  console.log('Tooltip fade: intermediate frames, no rebound, menu interaction and reduced motion passed')
} finally { await browser.close() }
