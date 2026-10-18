import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn} from 'node:child_process'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {withDeadline} from './with-deadline.mjs'
import {docxEditingChecks,validateInstalledDocxEditing} from './installed-v1-1-17-evidence.mjs'
const q=JSON.stringify,sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
export async function runInstalledV1117Workflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,repoRoot}) {
  for(const[key,value]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[key],value)
  assert.equal(appVersion,'1.1.17');assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary');assert.ok(process.env.LONGEDIT_XLSX_PYTHON)
  const folder=path.join(library,'v1117-docx-'+crypto.randomUUID()),unselected=path.join(folder,'不要修改.md'),ui=nativeUserInput({send,evaluate},{timeoutMs:45000}),report={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-docx-native-save-and-independent-zip-xml',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],outputs:[]},cases=[]
  const check=index=>report.checks.push({id:docxEditingChecks[index],status:'passed'}),body='document.querySelector(".docx-editor textarea")',draftCount='document.querySelectorAll(".draft-list article").length'
  const button=text=>ui.clickText('.docx-workspace button',text),dialogButton=text=>ui.clickText('.n-dialog button',text)
  const open=async file=>{await navigate('#/library?path='+encodeURIComponent(file),'.docx-workspace','actual DOCX page');await ui.waitFor('!!document.querySelector(".docx-page")','native DOCX read');if(await evaluate('document.querySelector("[title=\"打开 DOCX 页面编辑\"]")?.getAttribute("aria-pressed")')!=='true')await ui.click('[title="打开 DOCX 页面编辑"]');await ui.waitFor(body,'native editable target')}
  const save=async shortcut=>{if(shortcut)await ui.key('s','KeyS',83,2);else await ui.click('[title="保存到原文件"]');await ui.waitFor('!!document.querySelector(".n-dialog")','source confirmation');await dialogButton('保存到原文件');await ui.waitFor(`${draftCount}===0&&!document.querySelector('.docx-editor fieldset')?.disabled&&!!document.querySelector('.docx-page')`,'native save and reread')}
  let failure
  try {
    await fs.mkdir(folder);await fs.writeFile(path.join(folder,'.v119-installed-owner'),crypto.randomUUID(),{flag:'wx'});await fs.writeFile(unselected,'其他文件绝不改动\n',{flag:'wx'});report.unselectedBefore=sha(await fs.readFile(unselected))
    for(const producerId of ['microsoft-word-16','wps-writer','libreoffice-writer'])for(const suffix of ['before','source'])await fs.copyFile(path.join(repoRoot,'fixtures/docx/producers',producerId+'.docx'),path.join(folder,producerId+'-'+suffix+'.docx'),fs.constants.COPYFILE_EXCL)
    check(0)
    await evaluate(`window.__v1117Trace=[];window.__v1117Errors=[];for(const type of ['click','pointerdown','keydown','input'])addEventListener(type,e=>window.__v1117Trace.push({type,trusted:e.isTrusted,key:e.key||null,target:e.target?.tagName}),true);addEventListener('error',e=>window.__v1117Errors.push(e.message));addEventListener('unhandledrejection',e=>window.__v1117Errors.push(String(e.reason)))`)
    for(const [index,producerId]of ['microsoft-word-16','wps-writer','libreoffice-writer'].entries()){
      const source=path.join(folder,producerId+'-source.docx'),copyName=producerId+'-copy.docx',copy=path.join(folder,copyName),beforeHash=sha(await fs.readFile(source)),sourceEdits=[],copyEdits=[]
      await open(source);const original=await evaluate(body+'.value'),first=original+' [用户确认交付日期]';sourceEdits.push(first);await ui.fill('.docx-editor textarea',first);await ui.waitFor(`${draftCount}===1`,'source draft')
      if(index===0){
        await ui.click('[title="保存到原文件"]');await dialogButton('取消');assert.equal(sha(await fs.readFile(source)),beforeHash);assert.equal(await evaluate(body+'.value'),first);report.cancelExact=true;check(1)
        await ui.click('[title="重新读取"]');await dialogButton('继续编辑');assert.equal(await evaluate(body+'.value'),first);report.reloadCancelExact=true
        await evaluate(`location.hash=${q('#/library?path='+encodeURIComponent(source)+'&external=1')}`);await ui.waitFor('!!document.querySelector(".n-dialog")','same-path external transition protects draft');await dialogButton('继续编辑');await ui.waitFor(`!!${body}&&${body}.value===${q(first)}`,'cancelled external transition retains draft');assert.equal(sha(await fs.readFile(source)),beforeHash);report.samePathExternalDraftProtected=true
        const count=await evaluate('document.querySelector(".docx-editor select").options.length');assert.ok(count>=2,'Producer must expose multiple genuine editable targets')
        await ui.click('.docx-editor select');await ui.key('Home','Home',36);await ui.key('ArrowDown','ArrowDown',40);await ui.key('Enter','Enter',13)
        await ui.waitFor(`document.querySelector('.docx-editor select')?.selectedIndex===1&&${body}?.value!==${q(first)}`,'second genuine editable target selected')
        const second=(await evaluate(body+'.value'))+' [第二项也一起保存]';sourceEdits.push(second);await ui.fill('.docx-editor textarea',second);await ui.waitFor(`${draftCount}===2`,'batch draft');await ui.click('[title="撤销草稿修改"]');await ui.waitFor(`${draftCount}===1`,'whole target undo');await ui.click('[title="重做草稿修改"]');await ui.waitFor(`${draftCount}===2`,'whole target redo');report.undoRedoExact=true
      }
      assert.equal(await evaluate('document.querySelector(".verification-details")?.open'),false,'No manual verification step')
      await save(index===0);if(index===0)report.shortcutConfirmed=true
      assert.notEqual(sha(await fs.readFile(source)),beforeHash);const savedHash=sha(await fs.readFile(source));await navigate('#/library?path='+encodeURIComponent(unselected),'.library-mode','leave saved DOCX');await open(source);await ui.waitFor(`document.querySelector('.docx-stage')?.textContent.includes(${q(first)})`,'saved producer text reopened')
      await capture('installed-v1117-'+producerId+'-source.jpg')
      const copied=(await evaluate(body+'.value'))+' [另存给同事]';copyEdits.push(copied);await ui.fill('.docx-editor textarea',copied)
      if(index===0){await ui.fill('.copy-save input',path.basename(source));await button('另存新 DOCX 并打开');await ui.waitFor(`/禁止覆盖|已存在/.test(document.querySelector('.copy-save [role="alert"]')?.textContent||'')`,'actual source overwrite refusal reported');assert.equal(await evaluate(body+'.value'),copied);assert.equal(sha(await fs.readFile(source)),savedHash);report.collisionExact=true}
      await ui.fill('.copy-save input',copyName);await button('另存新 DOCX 并打开');await ui.waitFor(`document.querySelector('.document-title strong')?.textContent===${q(copyName)}&&${draftCount}===0&&!!document.querySelector('.docx-page')`,'native copy opened');assert.equal(sha(await fs.readFile(source)),savedHash)
      await ui.waitFor(`document.querySelector('.docx-stage')?.textContent.includes(${q(copied)})`,'native copy replacement text');await capture('installed-v1117-'+producerId+'-copy.jpg')
      cases.push({producerId,before:producerId+'-before.docx',source:path.basename(source),copy:copyName,sourceEdits,copyEdits})
    }
    report.sourceSavedExact=true;check(2);report.copySourceUnchanged=true;check(3);check(4);check(5);check(6);check(7);check(8)
    const request=path.join(folder,'inspection-request.json'),inspection=path.join(output,'v1117-docx-inspection.json');await fs.writeFile(request,JSON.stringify(cases));await fs.copyFile(request,path.join(output,'v1117-docx-inspection-request.json'),fs.constants.COPYFILE_EXCL)
    for(const item of cases)for(const key of ['before','source','copy']){const fileName=`installed-v1117-${item.producerId}-${key}.docx`,bytes=await fs.readFile(path.join(folder,item[key]));await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});report.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
    const child=spawn(process.env.LONGEDIT_XLSX_PYTHON,[path.join(repoRoot,'scripts/inspect-hosted-docx-delivery.py'),folder,request,inspection],{windowsHide:true,stdio:'inherit'});await withDeadline(()=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Independent DOCX inspection failed '+code)))}),60000,'independent DOCX XML inspection');report.inspection=JSON.parse(await fs.readFile(inspection,'utf8'));check(9)
    const external=path.join(folder,cases[0].source),externalHash=sha(await fs.readFile(external));await navigate('#/docx?path='+encodeURIComponent(external)+'&external=1','.docx-workspace','unauthorized external DOCX boundary');await ui.waitFor(`document.querySelector('.docx-state.error')?.textContent.includes('not been authorized by the user')`,'real native authorization refusal');assert.equal(await evaluate('document.querySelectorAll("[title=\"保存到原文件\"]").length'),0);assert.equal(await evaluate('document.querySelectorAll(".docx-editor").length'),0);assert.equal(sha(await fs.readFile(external)),externalHash);report.unauthorizedExternalRejected=true;report.externalReadOnly=true;check(10)
    report.unselectedAfter=sha(await fs.readFile(unselected));report.inputTrace=await evaluate('window.__v1117Trace');report.runtimeErrors=await evaluate('window.__v1117Errors');report.errorOverlay=await evaluate('!!document.querySelector(".error-overlay")');check(11);report.status='passed';validateInstalledDocxEditing(report,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]})
  } catch(error) {failure=error;report.status='failed';report.failure=String(error.stack||error);report.failureUI=await evaluate(`({path:location.hash,buttons:Array.from(document.querySelectorAll('.docx-workspace button'),e=>({text:e.textContent,title:e.title,disabled:e.disabled})),messages:Array.from(document.querySelectorAll('.n-message'),e=>e.textContent)})`).catch(()=>null);await capture('installed-v1117-failure.jpg').catch(()=>{})}
  finally {
    if(failure)for(const producerId of ['microsoft-word-16','wps-writer','libreoffice-writer'])for(const key of ['before','source','copy']){
      try{await fs.copyFile(path.join(folder,producerId+'-'+key+'.docx'),path.join(output,`installed-v1117-${producerId}-${key}.docx`),fs.constants.COPYFILE_EXCL)}catch(error){if(!['ENOENT','EEXIST'].includes(error.code))throw error}
    }
    report.inputTrace=await evaluate('window.__v1117Trace||[]').catch(()=>[]);report.runtimeErrors=await evaluate('window.__v1117Errors||[]').catch(()=>[]);await fs.writeFile(path.join(output,'installed-v1117-workflow.json'),JSON.stringify(report,null,2)+'\n')
  }
  if(failure)throw failure
}
