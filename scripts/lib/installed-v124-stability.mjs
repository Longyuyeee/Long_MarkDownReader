import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function runInstalledStabilityScenario({ send, evaluate, waitFor, navigate, capture, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || appVersion !== '1.0.24') throw new Error('Requires disposable v1.0.24')
  const observations = []
  const report = { appVersion, sourceCommit, installerSha256, sourceUserContentIncluded: false, status: 'running', observations }
  const click = async selector => {
    await waitFor(`document.querySelector(${JSON.stringify(selector)})`, selector)
    const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type,...point,button:'left',clickCount:1})
  }
  try {
    await navigate('#/graph', '.graph-container', 'graph layout regression')
    await waitFor(`!document.querySelector('.graph-container .loading-overlay')`, 'graph load')
    // Real toolbar input opens the tutorial over the installed synthetic graph.
    await click('.tutorial-btn')
    await waitFor(`document.querySelector('.tutorial-card')`, 'tutorial open')
    for (const [width,height] of [[1280,820],[720,600]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
      for (const expanded of [false,true]) {
        const isExpanded = await evaluate(`document.querySelector('.legend-toggle').getAttribute('aria-expanded')==='true'`)
        if (isExpanded !== expanded) await click('.legend-toggle')
        await evaluate('new Promise(resolve => setTimeout(resolve, 350))')
        const rects = await evaluate(`(() => {const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};return {legend:rect('.graph-semantic-legend'),canvas:rect('.graph-main-canvas'),tutorial:rect('.tutorial-card')}})()`)
        await capture(`installed-v124-graph-${width}-${expanded?'expanded':'collapsed'}.jpg`)
        assert.ok(rects.legend.bottom <= rects.canvas.top + 1, JSON.stringify(rects))
        assert.ok(rects.legend.bottom <= rects.tutorial.top + 1, JSON.stringify(rects))
        assert.ok(rects.tutorial.bottom <= height + 1 && rects.tutorial.left >= 0 && rects.tutorial.right <= width + 1, JSON.stringify(rects))
        assert.ok(rects.canvas.height >= 100, JSON.stringify(rects))
        observations.push({id:'graph-layout',width,height,expanded,rects,status:'passed'})
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
    await capture('installed-v124-close-cancel.jpg')
    const cancelSelector = '.exit-modal-overlay .modal-footer button:first-child'
    await click(cancelSelector)
    await waitFor(`!document.querySelector('#discard-confirm-title')`, 'cancel exit')
    assert.equal(await evaluate(`(${storeExpression}).isTempDirty`), true)
    observations.push({id:'native-close-cancel-preserves-draft',status:'passed',syntheticDraft:true})
    await evaluate(`(() => {const s=${storeExpression};s.isTempDirty=false;s.exitStrategy=${JSON.stringify(previousStrategy)}})()`)
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'; report.error = String(error); throw error
  } finally {
    await fs.writeFile(path.join(output,'installed-v124-stability.json'),JSON.stringify(report,null,2)+'\n')
  }
}
