// Actual search-result controls and native-parsed Office pages. No mock IPC,
// app-state assignment, DOM event dispatch or direct component calls.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {assertHostedSearchAudit} from './v118-native-search-fixture.mjs'
import {createNativeOfficeFixture,officeHash,officePathKey} from './v118-native-office-fixture.mjs'
export const nativeOfficeChecks=[
  'trusted-search-docx-block-visible-and-draft-preserved',
  'trusted-search-pptx-object-highlight-and-draft-preserved',
  'trusted-search-same-pptx-notes-page-and-details',
  'trusted-search-same-workbook-sheet-repeat-intent',
]
export const officeMatchTarget=(kind,title)=>`[...document.querySelectorAll('.command-palette-container .search-match-open')].find(e=>{const key=e.closest('[data-search-key]')?.dataset.searchKey;return key&&JSON.parse(key)[5]===${JSON.stringify(kind)}&&${title?`e.closest('.search-file-card')?.querySelector('.search-file-title')?.getAttribute('aria-label')===${JSON.stringify('打开 '+title)}`:'true'}})`
export const officeRouteQuery=hash=>{
  const delimiter=hash.indexOf('?')
  return delimiter<0?{}:Object.fromEntries(new URLSearchParams(hash.slice(delimiter+1)))
}
export async function runNativeOfficeInput({root,repo,output,ui,evaluate,capture,assertDraft,identity,store}){
  assertHostedSearchAudit()
  const report={...identity,schemaVersion:1,phase:'office',status:'running',evidenceLevel:identity.installed?'installed-webview-input-events-and-disk':'actual-wry-webview-input-events-generated-disk-not-installed',
    nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],sourceFiles:[],observations:{}}
  let files=[],failure
  const palette='.command-palette-container',q=JSON.stringify
  const startTrace=await evaluate('window.__v118UserInputTrace.length')
  const routeExpression=`(${officeRouteQuery.toString()})(location.hash)`
  const route=()=>evaluate(routeExpression)
  const openSearch=async(query,title)=>{
    await ui.key('p','KeyP',80,2);await ui.waitFor(`!!document.querySelector('${palette}')`,'Office search palette')
    await ui.click(palette+' .palette-scope');await ui.clickText('.n-base-select-option','当前资料库')
    await ui.fill(palette+' input[aria-label="搜索资料或命令"]',query)
    await ui.waitFor(`[...document.querySelectorAll('${palette} .search-file-title')].some(e=>e.getAttribute('aria-label')===${q('打开 '+title)})&&!document.querySelector('${palette} [aria-busy="true"]')`,'requested Office file among actual search results '+query)
  }
  const openMatch=async(kind,title)=>{await ui.clickTarget(officeMatchTarget(kind,title));await ui.waitFor(`!document.querySelector('${palette}')`,'search palette finishes its normal close transition')}
  const assertPath=async expected=>assert.equal(officePathKey((await route()).path||''),officePathKey(expected))
  try{
    files=await createNativeOfficeFixture(root,repo)
    await openSearch('"After explicit page break."',files[0].name)
    await openMatch('docx-block',files[0].name)
    await ui.waitFor(`(()=>{const p=${routeExpression},e=document.getElementById(p.locator),v=document.querySelector('.docx-stage');if(!e||!v||!e.textContent.includes('After explicit page break.'))return false;const r=e.getBoundingClientRect(),b=v.getBoundingClientRect();return r.height>0&&r.top>=b.top&&r.bottom<=b.bottom&&r.top>=0&&r.bottom<=innerHeight})()`,'actual DOCX matching block visible inside its stage')
    await assertPath(files[0].path);await assertDraft(false)
    report.observations.docx={...await route(),targetText:await evaluate(`document.getElementById((${routeExpression}).locator).textContent`),visible:true}
    await capture('office-docx-block');report.checks.push(nativeOfficeChecks[0])

    await openSearch('"Search and notes evidence"',files[1].name)
    await openMatch('pptx-object',files[1].name)
    await ui.waitFor(`document.querySelector('.slide-canvas .route-target-object')?.textContent.includes('Search and notes evidence')&&document.querySelector('.slide-strip button.active')?.dataset.slideIndex==='0'`,'actual PPTX object on first slide is highlighted')
    await assertPath(files[1].path);await assertDraft(false)
    report.observations.pptxObject={...await route(),objectId:await evaluate(`document.querySelector('.slide-canvas .route-target-object').dataset.objectId`),text:await evaluate(`document.querySelector('.slide-canvas .route-target-object').textContent`)}
    assert.equal(report.observations.pptxObject.locatorKind,'pptx-object');assert.equal(report.observations.pptxObject.locator,report.observations.pptxObject.objectId)
    await capture('office-pptx-object');report.checks.push(nativeOfficeChecks[1])

    await openSearch('"LibreOffice image relationship evidence."',files[1].name)
    await openMatch('pptx-slide',files[1].name)
    await ui.waitFor(`document.querySelector('.slide-strip button.active')?.dataset.slideIndex==='1'&&document.querySelector('.pptx-details .notes')?.textContent.includes('LibreOffice image relationship evidence.')`,'same PPTX switches to second slide and opens the matching notes')
    await assertPath(files[1].path);await assertDraft(false)
    report.observations.pptxNotes={...await route(),activeSlide:2,notes:await evaluate(`document.querySelector('.pptx-details .notes').textContent`)}
    assert.equal(report.observations.pptxNotes.matchKind,'notes');assert.equal(report.observations.pptxNotes.slide,'2')
    assert.notEqual(report.observations.pptxNotes.locatorToken,report.observations.pptxObject.locatorToken)
    await capture('office-pptx-notes');report.checks.push(nativeOfficeChecks[2])

    const workbook=[]
    for(const [query,sheet,body] of [['"Keyboard"','Inventory','Keyboard'],['"A-001"','Details','A-001']]){
      await openSearch(query,files[2].name)
      const matchingFiles=await evaluate(`document.querySelectorAll('${palette} .search-file-card').length`)
      const otherTitleMatches=await evaluate(`[...document.querySelectorAll('${palette} .search-file-title')].filter(e=>/^a-001[0-9]-记录\\.md$/i.test(e.textContent.trim())).length`)
      assert.equal(matchingFiles,sheet==='Details'?11:1);assert.equal(otherTitleMatches,sheet==='Details'?10:0)
      await openMatch('workbook-sheet',files[2].name)
      await ui.waitFor(`document.querySelector('.sheet-tabs button.active')?.textContent.trim()===${q(sheet)}&&document.querySelector('.workbook-view .sheet-row')&&document.querySelector('.workbook-view')?.textContent.includes(${q(body)})`,'actual workbook matching sheet '+sheet)
      await assertPath(files[2].path);await assertDraft(false)
      workbook.push({...await route(),activeSheet:sheet,visibleCellText:body,matchingFiles,otherTitleMatches})
      await capture('office-workbook-'+sheet.toLowerCase())
    }
    assert.notEqual(workbook[0].locatorToken,workbook[1].locatorToken)
    assert.equal(await evaluate(`${store}.tabs.filter(t=>(${officePathKey.toString()})(t.path||'')===${q(officePathKey(files[2].path))}).length`),1)
    report.observations.workbook=workbook
    await capture('office-workbook-repeat-sheet');report.checks.push(nativeOfficeChecks[3])
  }catch(error){failure=error;report.error={message:error.message,stack:error.stack}}
  finally{
    try{for(const file of files){const after=officeHash(await fs.readFile(file.path));assert.equal(after,file.sha256);report.sourceFiles.push({name:file.name,source:file.source,before:file.sha256,after})}}
    catch(error){failure ||= error;report.sourceError=String(error)}
    report.inputTrace=await evaluate(`window.__v118UserInputTrace.slice(${startTrace})`).catch(()=>[])
    report.uiObservation=await evaluate('({errorOverlay:!!document.querySelector("#crash-screen,#runtime-error-notice,.route-error-notice,.global-error-overlay,.startup-fatal-screen")})').catch(()=>({errorOverlay:true}))
    if(report.uiObservation.errorOverlay||report.runtimeErrors.length)failure ||= Error('Office runtime error surface or exception')
    report.status=failure?'failed':'passed'
    if(failure)await capture('office-failure').catch(()=>{})
    await fs.writeFile(path.join(output,identity.installed?'installed-v118-office.json':'native-office.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'})
  }
  if(failure)throw failure
  return report
}
