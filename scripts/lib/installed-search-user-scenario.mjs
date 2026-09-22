import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export async function runInstalledSearchScenario({ send, evaluate, waitFor, navigate, capture, library, output, sourceCommit, installerSha256 }) {
  // This destructive environment simulation is only valid in the existing disposable runner.
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || path.resolve(library).toLowerCase() !== 'c:\\longeditr5ilibrary') {
    throw new Error('Search scenario requires the disposable R5I library, never a user library')
  }
  const fixtures = [
    ['客户会议纪要-九月交付确认.md', '# 客户会议纪要：九月交付确认\n\n客户说周五前确认交付范围。我要先核对预算，再发正式回复。\n\n#客户跟进\n'],
    ['客户会议纪要-九月交付确认-内部草稿.md', '# 客户会议纪要：内部讨论草稿\n\n这份不是给客户的确认版。预算尚未审批，请勿对外发送。\n\n#客户跟进\n'],
  ]
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
  const offline = `${library}-search-offline`
  let moved = false
  const checks = []
  const input = '.search-area input'
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers })
  }
  const click = async selector => {
    const pointExpression = `(() => {
      const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return null;
      if(e.disabled || getComputedStyle(e).visibility==='hidden' || getComputedStyle(e).display==='none')return null;
      const r=e.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2;
      if(!r.width||!r.height||!e.contains(document.elementFromPoint(x,y)))return null;
      return {x,y};
    })()`
    // Navigation and sidebar transitions may mount the control before it is hit-testable.
    // Wait for actual actionability, never bypass an overlay or call the handler directly.
    await waitFor(pointExpression, `visible unobscured input target: ${selector}`, 80)
    const point = await evaluate(pointExpression)
    if (!point) throw new Error(`Visible input target missing: ${selector}`)
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 })
  }
  const query = async value => {
    await click(input)
    if (!await evaluate(`document.activeElement.matches(${JSON.stringify(input)})`)) throw new Error('Search input did not receive focus')
    await key('a', 'KeyA', 65, 2)
    await key('Backspace', 'Backspace', 8)
    if (value) await send('Input.insertText', { text: value })
    await waitFor(`document.querySelector(${JSON.stringify(input)})?.value === ${JSON.stringify(value)}`, 'query entered through keyboard')
  }
  const tabTo = async selector => {
    for (let n = 0; n < 40; n++) {
      await key('Tab', 'Tab', 9)
      if (await evaluate(`document.activeElement.matches(${JSON.stringify(selector)})`)) return
    }
    throw new Error(`Keyboard cannot reach ${selector}`)
  }
  const receipt = { schemaVersion: 1, sourceCommit, installerSha256, evidenceLevel: 'installed-webview-input-events', sourceUserContentIncluded: false, checks, status: 'running' }
  try {
    await fs.access(offline).then(() => { throw new Error('Offline destination already exists') }, e => { if(e.code!=='ENOENT')throw e })
    for (const [name, content] of fixtures) await fs.writeFile(path.join(library, name), content, { flag: 'wx' })
    await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false })
    await navigate('#/library', '.library-mode', 'search user scenario library')
    await click('#tab-files')
    await click('button[title="刷新列表"]')
    // Rebuild via visible menu and real input, not an IPC call or component method.
    await waitFor(`!document.querySelector('button[title="搜索与关联选项"]')?.disabled`, 'index controls ready')
    await click('button[title="搜索与关联选项"]')
    await waitFor(`[...document.querySelectorAll('.n-dropdown-option')].some(e=>e.innerText.includes('重新准备搜索与关联'))`, 'rebuild menu')
    const menu = await evaluate(`(() => {const e=[...document.querySelectorAll('.n-dropdown-option')].find(e=>e.innerText.includes('重新准备搜索与关联')); const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...menu, button:'left',clickCount:1 })
    await waitFor(`document.body.innerText.includes('搜索与关联：可用')`, 'rebuild completed')
    for (const [label, value] of [['keyword', '客户会议纪要'], ['tag', '#客户跟进']]) {
      await query(value)
      await waitFor(`document.querySelectorAll('.knowledge-result-open').length >= 2`, `${label} baseline results`)
      await capture(`search-${label}-baseline.jpg`)
      await query('')
      await fs.rename(library, offline); moved = true
      await query(value)
      await waitFor(`document.querySelector('.search-feedback-error')?.innerText.includes('搜索未完成')`, `${label} honest failure feedback`)
      await capture(`search-${label}-offline.jpg`)
      await fs.rename(offline, library); moved = false
      await tabTo('.search-feedback-error button')
      await key('Enter', 'Enter', 13)
      await waitFor(`!document.querySelector('.search-feedback-error') && document.querySelectorAll('.knowledge-result-open').length >= 2`, `${label} retry recovery`)
      if (!await evaluate(`document.querySelector(${JSON.stringify(input)}).value === ${JSON.stringify(value)}`)) throw new Error('Retry changed user query')
      await capture(`search-${label}-retry.jpg`)
      checks.push({ id: `${label}-offline-keyboard-retry-query-preserved`, status: 'passed' })
    }
    await query('客户会议纪要')
    await waitFor(`document.querySelectorAll('.knowledge-result-open').length >= 2`, 'similar titles')
    const exact = `.knowledge-result-open[title=${JSON.stringify(fixtures[0][0])}]`
    await tabTo(exact)
    await capture('search-keyboard-focused-title.jpg')
    await key('Enter', 'Enter', 13)
    await waitFor(`document.querySelector('.library-embedded-editor')?.innerText.includes('我要先核对预算')`, 'correct confirmation document opened')
    const openedPath = await evaluate(`new URLSearchParams(location.hash.split('?')[1]||'').get('path')`)
    if (path.resolve(openedPath || '').toLowerCase() !== path.join(library, fixtures[0][0]).toLowerCase()) throw new Error('Keyboard opened wrong near-duplicate file')
    await capture('search-keyboard-opened-document.jpg')
    checks.push({ id:'keyboard-near-duplicate-target-open', status:'passed' })
    for (const [name, content] of fixtures) if(hash(await fs.readFile(path.join(library,name)))!==hash(content))throw new Error('Read-only scenario changed fixture source')
    checks.push({ id:'source-files-unchanged',status:'passed' })
    receipt.status='passed'
  } catch (error) {
    receipt.status='failed'; receipt.error=String(error)
    await capture('search-failure.jpg').catch(()=>{})
    throw error
  } finally {
    if (moved) await fs.rename(offline,library)
    await fs.writeFile(path.join(output,'installed-search-user-scenario.json'),JSON.stringify(receipt,null,2)+'\n')
  }
}
