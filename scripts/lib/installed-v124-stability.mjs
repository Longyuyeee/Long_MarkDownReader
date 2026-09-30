import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { visibleVersionSurfaceExpression } from './installed-version-identity.mjs'
import { checkInstalledMarkdown } from './installed-markdown-performance.mjs'

export async function runInstalledStabilityScenario({ send, evaluate, waitFor, navigate, capture, library, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || appVersion !== '1.0.24') throw new Error('Requires disposable v1.0.24')
  const observations = []
  const report = { appVersion, sourceCommit, installerSha256, sourceUserContentIncluded: false, status: 'running', observations }
  const click = async selector => {
    await waitFor(`document.querySelector(${JSON.stringify(selector)})`, selector)
    const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type,...point,button:'left',clickCount:1})
  }
  try {
    await navigate('#/graph?focus=relations', '.graph-container', 'graph layout regression')
    await waitFor(`!document.querySelector('.graph-container .graph-loading')`, 'graph load')
    // The relations guidance route may already open the tutorial automatically.
    if (!await evaluate(`!!document.querySelector('.tutorial-card')`)) await click('.tutorial-btn')
    await waitFor(`document.querySelector('.tutorial-card')`, 'tutorial open')
    for (const [width,height] of [[1280,820],[720,600]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
      for (const expanded of [false,true]) {
        const isExpanded = await evaluate(`document.querySelector('.legend-toggle').getAttribute('aria-expanded')==='true'`)
        if (isExpanded !== expanded) await click('.legend-toggle')
        await evaluate('new Promise(resolve => setTimeout(resolve, 350))')
        const rects = await evaluate(`(() => {const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};return {options:rect('.graph-options'),banner:rect('.remediation-banner'),legend:rect('.graph-semantic-legend'),canvas:rect('.graph-main-canvas'),tutorial:rect('.tutorial-card')}})()`)
        await capture(`installed-v124-graph-${width}-${expanded?'expanded':'collapsed'}.jpg`)
        assert.ok(rects.options.bottom <= rects.legend.top + 1, JSON.stringify(rects))
        assert.ok(rects.legend.bottom <= rects.banner.top + 1, JSON.stringify(rects))
        assert.ok(rects.banner.bottom <= rects.canvas.top + 1, JSON.stringify(rects))
        assert.ok(rects.banner.bottom <= rects.tutorial.top + 1, JSON.stringify(rects))
        assert.ok(rects.legend.bottom <= rects.canvas.top + 1, JSON.stringify(rects))
        assert.ok(rects.legend.bottom <= rects.tutorial.top + 1, JSON.stringify(rects))
        assert.ok(rects.tutorial.bottom <= height + 1 && rects.tutorial.left >= 0 && rects.tutorial.right <= width + 1, JSON.stringify(rects))
        assert.ok(rects.canvas.height >= 100, JSON.stringify(rects))
        const tutorialUnobscured = await evaluate(`(() => {const e=document.querySelector('.tutorial-card'),r=e.getBoundingClientRect();for(let x=r.left+12;x<r.right-12;x+=30)for(let y=r.top+12;y<r.bottom-12;y+=30)if(!e.contains(document.elementFromPoint(x,y)))return false;return true})()`)
        assert.equal(tutorialUnobscured, true, 'Graph controls must not cover tutorial content')
        observations.push({id:'graph-layout',width,height,expanded,rects,tutorialUnobscured,status:'passed'})
      }
    }
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:820,deviceScaleFactor:1,mobile:false})
    await navigate('#/library', '.library-mode', 'close regression')
    // Synthetic draft state exercises the real native CloseRequested round trip.
    // Editor-specific draft/save behavior is covered by the installed I/O suite.
    const storeExpression = `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
    const previousStrategy = await evaluate(`(${storeExpression}).exitStrategy`)
    await evaluate(`(() => {const s=${storeExpression};s.isTempDirty=true;s.exitStrategy='quit'})()`)
    await evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})`)
    await waitFor(`document.querySelector('#discard-confirm-title')`, 'native close draft confirmation')
    await waitFor(visibleVersionSurfaceExpression('.exit-modal-overlay .modal-footer'), 'exit confirmation animation settled')
    await capture('installed-v124-close-cancel.jpg')
    const cancelSelector = '.exit-modal-overlay .modal-footer button:first-child'
    await click(cancelSelector)
    await waitFor(`!document.querySelector('#discard-confirm-title')`, 'cancel exit')
    assert.equal(await evaluate(`(${storeExpression}).isTempDirty`), true)
    observations.push({id:'native-close-cancel-preserves-draft',status:'passed',syntheticDraft:true})
    await evaluate(`(() => {const s=${storeExpression};s.isTempDirty=false;s.exitStrategy=${JSON.stringify(previousStrategy)}})()`)
    assert.equal(await evaluate(`!!document.querySelector('#runtime-error-notice')`), false, 'Normal installed flows must not produce a runtime error notice')
    report.markdown = await checkInstalledMarkdown({ send, evaluate, waitFor, navigate, capture, library, output })
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'; report.error = String(error); throw error
  } finally {
    await fs.writeFile(path.join(output,'installed-v124-stability.json'),JSON.stringify(report,null,2)+'\n')
  }
}
