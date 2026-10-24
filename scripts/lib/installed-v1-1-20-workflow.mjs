import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn} from 'node:child_process'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {withDeadline} from './with-deadline.mjs'
import {structuredChecks,validateInstalledStructured} from './installed-v1-1-20-evidence.mjs'
const q=JSON.stringify,sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
export async function runInstalledV1120Workflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,repoRoot}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.ok(['1.1.20','1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const folder=path.join(library,'v1120-structured-'+crypto.randomUUID()),ui=nativeUserInput({send,evaluate},{timeoutMs:35000}),p=file=>path.join(folder,file)
 const specs=[
  ['json','jsonc','// 保留注释\r\n{"value":"原始内容","big":9007199254740993,"a/b~c":["保留路径"]}\r\n'],
  ['yaml','yaml','# 保留注释\r\nvalue: 原始内容\r\nbase: &base 保留锚点\r\nalias: *base\r\n'],
  ['xml','xml','<root keep="原始属性">\r\n<!--保留注释--><value>原始内容</value>\r\n</root>\r\n'],
  ['toml','toml','# 保留注释\r\nvalue = "原始内容"\r\nbig = 9007199254740993\r\n'],
 ]
 const report={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-structured-editors-and-original-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],outputs:[],saveExact:{},reopenExact:{},conflictOriginalExact:{},conflictDraftExact:{},copyExact:{}}
 const mark=i=>report.checks.push({id:structuredChecks[i],status:'passed'}),gone=()=>ui.waitFor('!document.querySelector(".n-dialog")','confirmation dismissed')
 const content=()=>evaluate(`document.querySelector('.cm-content[contenteditable="true"]')?.innerText`)
 const select='.cm-content[contenteditable="true"]'
 const open=async(file,mode)=>{await navigate('#/library?path='+encodeURIComponent(file),'.'+mode+'-workspace','real structured editor');await ui.waitFor(`!!document.querySelector('${select}')&&document.querySelector('.${mode}-workspace')?.dataset.loading==='false'`,'structured source loaded')}
 const saved=mode=>ui.waitFor(`document.querySelector('.${mode}-workspace')?.dataset.dirty==='false'&&document.querySelector('.${mode}-workspace')?.dataset.saving==='false'`,'real source save receipt')
 const reload=async()=>{await ui.click('header button[title*="重新"],header button[data-app-tooltip*="重新"]')}
 const take=async(file,name)=>{const bytes=await fs.readFile(file),fileName='installed-v1120-'+name;await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});report.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
 let failure
 try{
  await fs.mkdir(folder);await fs.writeFile(p('不要修改.md'),'其他资料不应被修改\n',{flag:'wx'});report.unselectedBefore=sha(await fs.readFile(p('不要修改.md')))
  for(const[mode,ext,source]of specs)await fs.writeFile(p(mode+'.'+ext),'\uFEFF'+source,{flag:'wx'})
  await evaluate(`window.__v1120Trace=[];window.__v1120Errors=[];window.__v1120Messages=[];window.__v1120Seen=new Set();for(const type of ['click','pointerdown','keydown','input'])addEventListener(type,e=>window.__v1120Trace.push({type,trusted:e.isTrusted,key:e.key||null}),true);addEventListener('error',e=>window.__v1120Errors.push(e.message));addEventListener('unhandledrejection',e=>window.__v1120Errors.push(String(e.reason)));new MutationObserver(()=>{for(const e of document.querySelectorAll('.n-message'))if(!window.__v1120Seen.has(e.textContent)){window.__v1120Seen.add(e.textContent);window.__v1120Messages.push(e.textContent)}}).observe(document.body,{subtree:true,childList:true})`)
  for(const[mode,ext,source]of specs){
   const file=p(mode+'.'+ext),initial='\uFEFF'+source,changed=source.replace('原始内容','保存内容').replaceAll('\r\n','\n')
   await open(file,mode);await ui.fill(select,changed);await ui.key('s','KeyS',83,2);await saved(mode)
   assert.equal(await fs.readFile(file,'utf8'),initial.replace('原始内容','保存内容'));report.saveExact[mode]=true
   await take(file,mode+'-saved.'+ext)
   await navigate('#/library?path='+encodeURIComponent(p('不要修改.md')),'#vditor-lib','ordinary text between structured reopens')
   await ui.waitFor(`Array.from(document.querySelectorAll('#vditor-lib [contenteditable="true"]')).some(e=>e.getClientRects().length&&e.textContent.includes('其他资料不应被修改'))`,'ordinary text fully loaded before reopening')
   await open(file,mode);assert.match(await content(),/保存内容/);report.reopenExact[mode]=true;mark(specs.findIndex(s=>s[0]===mode)*2)
   const draft=changed.replace('保存内容','我的冲突草稿');await ui.fill(select,draft)
   const peer=initial.replace('原始内容','同事改动');await fs.writeFile(file,peer);const before=sha(await fs.readFile(file))
   await ui.key('s','KeyS',83,2);await ui.waitFor('!!document.querySelector(".text-conflict-dialog")','native conflict comparison')
   await ui.clickText('.text-conflict-dialog button','另存当前副本');await ui.waitFor('!document.querySelector(".text-conflict-dialog")','draft sibling copy receipt')
   assert.equal(sha(await fs.readFile(file)),before);report.conflictOriginalExact[mode]=true;assert.match(await content(),/我的冲突草稿/);report.conflictDraftExact[mode]=true
   const copies=(await fs.readdir(folder)).filter(name=>name.startsWith(mode+'-当前副本')&&name.endsWith('.'+ext));assert.equal(copies.length,1);const copy=p(copies[0]);assert.equal(await fs.readFile(copy,'utf8'),draft);report.copyExact[mode]=true
   await take(copy,mode+'-copy.'+ext);mark(specs.findIndex(s=>s[0]===mode)*2+1)
   if(mode==='toml'){
    await reload();await ui.clickText('.n-dialog button','继续编辑');await gone();assert.match(await content(),/我的冲突草稿/);report.reloadCancelExact=true
    const offline=file+'.offline';await fs.rename(file,offline)
    try{await reload();await ui.clickText('.n-dialog button','放弃修改并重新读取');await gone();await ui.waitFor(`document.body.innerText.includes('重新读取失败')`,'native missing source read feedback');assert.match(await content(),/我的冲突草稿/);report.reloadFailureExact=true}finally{await fs.rename(offline,file)}
    await capture('installed-v1120-toml-draft.jpg')
   }
   await reload();await ui.clickText('.n-dialog button','放弃修改并重新读取');await gone();await ui.waitFor(`document.querySelector('.${mode}-workspace')?.dataset.dirty==='false'`,'explicit owned draft discard')
  }
  const json=p('json.jsonc');await open(json,'json');const prior=await content(),format='button[title="格式化源码"],button[data-app-tooltip="格式化源码"]'
  await ui.click(format);await ui.waitFor('!!document.querySelector(".structured-change-dialog")','native token formatting preview');assert.equal(await content(),prior);await ui.clickText('.structured-change-dialog button','取消');report.formatCancelExact=true
  await ui.click(format);await ui.waitFor('!!document.querySelector(".structured-change-dialog")','format preview again');await capture('installed-v1120-format-preview.jpg');await ui.clickText('.structured-change-dialog button','应用到草稿');await ui.waitFor(`document.querySelector('.json-workspace')?.dataset.dirty==='true'`,'candidate applied only to draft');assert.notEqual(await content(),prior);report.formatApplyExact=true
  await ui.click(select);await ui.key('z','KeyZ',90,2);await ui.waitFor(`document.querySelector('.cm-content')?.innerText===${q(prior)}`,'one action formatting undo');report.formatUndoExact=true;mark(8)
  const pathFilter='[aria-label="筛选字段路径"] input'
  if (!await evaluate(`!!document.querySelector(${q(pathFilter)})?.getClientRects().length`)) await ui.clickText('header button','结构与诊断')
  await ui.waitFor(`!!document.querySelector(${q(pathFilter)})?.getClientRects().length`,'open existing inspector')
  await ui.fill(pathFilter,'/a~1b~0c/0');await ui.waitFor(`document.querySelectorAll('.path-item').length===1`,'native escaped pointer search');await ui.key('Enter','Enter',13)
  await ui.waitFor(`document.activeElement?.closest('.cm-editor')`,'pointer Enter focuses source');assert.equal(await content(),prior,'Enter navigation must not replace source');report.navigationSourceExact=true;await ui.waitFor(`getSelection().toString().includes('保留路径')`,'pointer Enter actually selects native source');report.pointerNavigationExact=true
  await ui.key('Home','Home',36,2);await ui.waitFor('getSelection().toString()===""','move away from the target before context navigation');await ui.clickTarget(`document.querySelector('.path-item > button')`,'right');await ui.clickText('.n-dropdown-option-body','定位到源码');await ui.waitFor(`document.activeElement?.closest('.cm-editor')&&getSelection().toString().includes('保留路径')`,'real context menu source navigation');assert.equal(await content(),prior,'Context navigation must preserve source');report.contextNavigationExact=true;mark(9);mark(10);await capture('installed-v1120-source-navigation.jpg')
  if(['1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26'].includes(appVersion)){
   // Formatting was undone to the actual read baseline. Accurate savepoints
   // should keep this clean, so there must be no discard confirmation.
   assert.equal(await evaluate(`document.querySelector('.json-workspace')?.dataset.dirty`),'false')
   const disk=await fs.readFile(json),display=disk.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')
   assert.equal(await evaluate(`[...document.querySelectorAll('.json-workspace .cm-content[contenteditable="true"] .cm-line')].map(e=>e.textContent).join('\\n')`),display)
   report.formatUndoDiskBefore=sha(disk);await reload();await ui.waitFor(`document.querySelector('.json-workspace')?.dataset.loading==='false'&&document.querySelector('.json-workspace')?.dataset.dirty==='false'`,'clean original source reloaded without discard')
   assert.equal(await evaluate(`!!document.querySelector('.n-dialog')`),false);assert.equal(await content(),prior);report.formatUndoDiskAfter=sha(await fs.readFile(json));assert.equal(report.formatUndoDiskBefore,report.formatUndoDiskAfter);report.formatUndoCleanExact=true;report.cleanReloadWithoutConfirmation=true
  }else{await reload();await ui.clickText('.n-dialog button','放弃修改并重新读取');await gone()}
  await take(p('不要修改.md'),'unselected.md')
  const inspection=path.join(output,'v1120-structured-inspection.json'),child=spawn(process.env.LONGEDIT_XLSX_PYTHON,[path.join(repoRoot,'scripts/inspect-hosted-structured.py'),output,inspection],{windowsHide:true,stdio:'inherit'})
  await withDeadline(()=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Structured independent inspection failed '+code)))}),60000,'independent structured output inspection');report.inspection=JSON.parse(await fs.readFile(inspection,'utf8'));mark(11)
  report.inputTrace=await evaluate('window.__v1120Trace');report.runtimeErrors=await evaluate('window.__v1120Errors');report.uiMessages=await evaluate('window.__v1120Messages');report.shortcutExclusive=!report.uiMessages.some(text=>text.includes('当前文件没有文本写入适配器'));report.errorOverlay=await evaluate('!!document.querySelector(".error-overlay")');report.unselectedAfter=sha(await fs.readFile(p('不要修改.md')));mark(12);report.status='passed'
  validateInstalledStructured(report,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]})
 }catch(error){failure=error;report.status='failed';report.failure=String(error.stack||error);report.failureUI=await evaluate(`({hash:location.hash,body:document.body.innerText.slice(-6000),workspace:document.querySelector('.json-workspace,.yaml-workspace,.xml-workspace,.toml-workspace')?.innerText.slice(0,3000),selectedText:getSelection()?.toString(),activeElement:document.activeElement?.outerHTML.slice(0,500),source:document.querySelector('.cm-content[contenteditable="true"]')?.innerText.slice(0,4000)})`).catch(()=>null);await capture('installed-v1120-failure.jpg').catch(()=>{})}
 finally{report.runtimeErrors=await evaluate('window.__v1120Errors||[]').catch(()=>[]);await fs.writeFile(path.join(output,'installed-v1120-workflow.json'),JSON.stringify(report,null,2)+'\n')}
 if(failure)throw failure
}
