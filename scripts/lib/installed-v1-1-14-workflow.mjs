import {chooseInstalledMarkdownMode,openInstalledDocumentExport} from './installed-markdown-mode.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn} from 'node:child_process'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {visibleMarkdownInput} from './visible-markdown-input.mjs'
import {withDeadline} from './with-deadline.mjs'
import {writingImageFixture} from './writing-delivery-fixture.mjs'
import {inspectStandaloneDelivery} from './standalone-delivery-browser.mjs'
import {selectHostedBrowserPdf} from './hosted-writing-print-selection.mjs'
import {writingDeliveryChecks,validateInstalledWritingDelivery} from './installed-v1-1-14-evidence.mjs'
const q=JSON.stringify,sha=b=>crypto.createHash('sha256').update(b).digest('hex'),store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
export async function runInstalledV1114Workflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable,repoRoot}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.ok(['1.1.14','1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const report={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),evidenceLevel:'installed-writing-native-pickers-print-and-disk',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,status:'running',checks:[]}
 const ui=nativeUserInput({send,evaluate},{timeoutMs:60000}),editor=visibleMarkdownInput('#vditor-lib'),check=i=>report.checks.push({id:writingDeliveryChecks[i],status:'passed'})
 const folder=path.join(library,'v1114-writing-'+crypto.randomUUID()),source=path.join(folder,'交付 草稿.md'),shared=path.join(folder,'共享 图片.png'),unselected=path.join(folder,'别改我的正文.md'),html=path.join(folder,'文章 交付.html'),md=path.join(folder,'仅正文.md'),pdf=path.join(folder,'真实 打印.pdf'),cancel=path.join(folder,'取消后不能出现.md'),movedFolder=path.join(folder,'换个目录阅读'),movedHtml=path.join(movedFolder,'独立文章.html')
 const tab=()=>`${store}.tabs.find(t=>t.path===${q(source)})`,mode=async m=>{await chooseInstalledMarkdownMode({send,evaluate},{sv:'源码编辑',wysiwyg:'所见即所得',ir:'即时渲染 IR'}[m]);await ui.waitFor(`${store}.editorMode===${q(m)}&&!!(${editor})`,'actual editor mode '+m)}
 const button=t=>ui.clickText('.writing-delivery-dialog button',t)
 const picker=async(title,target,action,tag,cancelled=false)=>{
  const file=path.join(output,`v1114-${tag}-picker.json`),args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'scripts/select-hosted-session-file.ps1'),'-Executable',installedExecutable,'-Title',title,'-SelectedPath',target,'-OwnerRoot',folder,'-Report',file,...(cancelled?['-Cancel']:[])]
  const child=spawn('powershell.exe',args,{windowsHide:true,stdio:'inherit'}),done=new Promise((r,j)=>{child.once('error',j);child.once('exit',c=>c===0?r():j(Error(tag+' native picker failed '+c)))})
  await action();await withDeadline(()=>done,70000,'actual '+tag+' picker');return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''))
 }
 const openExport=async()=>{await openInstalledDocumentExport({send,evaluate});await ui.clickText('.n-dropdown-option-body__label','导出 PDF');await ui.waitFor(`document.querySelector('.writing-delivery-dialog iframe')?.contentDocument?.querySelector('main')&&[...document.querySelector('.writing-delivery-dialog iframe').contentDocument.images].every(i=>i.complete&&i.naturalWidth>0)`,'actual delivery frame and loaded local images')}
 let failure
 try{
  await fs.mkdir(folder);await fs.writeFile(path.join(folder,'.v119-installed-owner'),crypto.randomUUID(),{flag:'wx'});await fs.writeFile(source,'# 磁盘原稿\n请不要代存我的内容。\n',{flag:'wx'});await fs.writeFile(shared,writingImageFixture(),{flag:'wx'});await fs.writeFile(unselected,'无关正文和共享图不能改变。\n',{flag:'wx'});await fs.mkdir(movedFolder)
  for(const[k,file]of Object.entries({source,shared,unselected}))report[k+'Before']=sha(await fs.readFile(file))
  await evaluate(`window.__v1114Trace=[];window.__v1114Errors=[];for(const type of ['click','keydown','input','paste'])addEventListener(type,e=>window.__v1114Trace.push({type,trusted:e.isTrusted}),true);addEventListener('error',e=>window.__v1114Errors.push(e.message));addEventListener('unhandledrejection',e=>window.__v1114Errors.push(String(e.reason)))`)
  check(0)
  await navigate('#/library?path='+encodeURIComponent(source),'.library-mode','actual writing document');await ui.waitFor(`(${editor})?.textContent.includes('磁盘原稿')`,'source loaded');report.modeBefore=await evaluate(`${store}.editorMode`)
  // Create the custom template through ordinary document operations, not config injection.
  await ui.click('[data-testid="library-document-menu"]');await ui.clickText('button','保存为模板…');await ui.waitFor(`!!document.querySelector('.note-template-dialog')`,'actual template manager')
  const templateName='交付模板 '+crypto.randomUUID().slice(0,8)
  await ui.fill('[aria-label="模板名称"]',templateName);await ui.fill('[aria-label="模板正文"]','# {{title}}\n作者：{{param:作者}}\n未知：{{keep}}\n');await ui.clickText('.note-template-dialog button','保存模板');await ui.waitFor(`${store}.noteTemplates.some(t=>t.name===${q(templateName)})`,'native saved template');await ui.clickText('.note-template-dialog button','关闭')
  await ui.click('[data-testid="library-create-menu"]');await ui.clickText('.n-dropdown-option-body__label','填写模板后新建…');await ui.click('.template-create-dialog select');await ui.key('Home','Home',36)
  for(let n=0;n<70;n++){if(await evaluate(`document.querySelector('.template-create-dialog select')?.selectedOptions[0]?.textContent===${q(templateName)}`))break;await ui.key('ArrowDown','ArrowDown',40)}await ui.key('Enter','Enter',13)
  await ui.fill('[aria-label="文章标题"]','用户填写的文章');await ui.fill('[aria-label="模板参数 作者"]','小林 {{time}}');await capture('installed-v1114-template-preview.jpg');await ui.clickText('.template-create-dialog button','在此新建');await ui.waitFor(`!document.querySelector('.template-create-dialog')`,'template note created')
  await ui.waitFor(`${store}.tabs.find(t=>t.id===${store}.activeTabId)?.path.endsWith('用户填写的文章.md')&&(${editor})?.textContent.includes('小林 {{time}}')`,'the new template note actually opens with its filled content in the main editor')
  report.templateMainText=await evaluate(`(${editor}).textContent`);await capture('installed-v1114-template-created-main.jpg')
  report.templateBody=await fs.readFile(path.join(folder,'用户填写的文章.md'),'utf8');report.templateCreatedWithParameters=report.templateBody==='# 用户填写的文章\n作者：小林 {{time}}\n未知：{{keep}}\n';assert.equal(report.templateCreatedWithParameters,true);check(1)
  await navigate('#/library?path='+encodeURIComponent(source),'.library-mode','return untouched source');await ui.waitFor(`(${editor})?.textContent.includes('磁盘原稿')`,'source restored');if(await evaluate(`${store}.editorMode`)!=='sv')await mode('sv')
  const draft='# 这篇交付方案仍未保存\n\n![共享图片](共享%20图片.png)\n\n'+Array.from({length:70},(_,n)=>`## 章节 ${n+1}\n\n这是中文文章第 ${n+1} 段，保留读者可读的内容、表格与本地图片。\n\n| 任务 | 状态 |\n| --- | --- |\n| 资料整理 | 继续推进 |\n`).join('\n')
  const clipboardFile=path.join(folder,'.native-paste-input');await fs.writeFile(clipboardFile,draft,{flag:'wx'})
  const clipboard=spawn('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'scripts/set-hosted-writing-clipboard.ps1'),'-OwnerRoot',folder,'-TextFile',clipboardFile],{windowsHide:true,stdio:'inherit'})
  await withDeadline(()=>new Promise((r,j)=>{clipboard.once('error',j);clipboard.once('exit',c=>c===0?r():j(Error('owned synthetic clipboard failed '+c)))}),30000,'disposable native Unicode clipboard')
  await ui.clickTarget(editor);await ui.key('a','KeyA',65,2);await ui.key('v','KeyV',86,2);await ui.waitFor(`${tab()}?.isDirty&&${tab()}?.content.trimEnd()===${q(draft.trimEnd())}`,'ordinary trusted paste preserves every paragraph and table; only editor trailing blank lines may differ')
  await ui.clickText('#vditor-lib .vditor-toolbar-label','更多格式')
  report.imagePicker=await picker('插入本地图片',shared,()=>ui.clickText('#vditor-lib .vditor-toolbar-label','本地图片…'),'image')
  await ui.waitFor(`${tab()}?.content.includes('.assets/')`,'image relative reference actually inserted');const liveDraft=await evaluate(`${tab()}.content`)
  report.relativeImageInserted=liveDraft.includes('.assets/')&&!liveDraft.includes('data:image/');assert.ok(report.relativeImageInserted);check(2);check(3)
  // Owned fault injection: a missing shared resource must remain actionable
  // even if the user first cancels a body-only export. Restore exact bytes.
  await fs.rename(shared,shared+'.missing')
  await openInstalledDocumentExport({send,evaluate});await ui.clickText('.n-dropdown-option-body__label','导出 HTML');await ui.waitFor(`document.querySelector('.writing-delivery-dialog [role=alert]')?.textContent.includes('图片')`,'honest missing-image preparation error')
  report.resourceCancelPicker=await picker('导出新文档（不覆盖已有文件）',cancel,()=>button('Markdown 仅正文…'),'resource-recovery-cancel',true)
  report.resourceErrorRetainedAfterMarkdown=await evaluate(`document.querySelector('.writing-delivery-dialog [role=alert]')?.textContent.includes('图片')&&[...document.querySelectorAll('.writing-delivery-dialog button')].some(b=>b.textContent.trim()==='重新准备')`);assert.equal(report.resourceErrorRetainedAfterMarkdown,true)
  await capture('installed-v1114-resource-error-after-markdown.jpg');await fs.rename(shared+'.missing',shared);await button('重新准备');await ui.waitFor(`document.querySelector('.writing-delivery-dialog iframe')?.contentDocument?.images.length===2&&[...document.querySelector('.writing-delivery-dialog iframe').contentDocument.images].every(i=>i.complete&&i.naturalWidth>0)`,'exact restored resource prepares successfully');await button('关闭')
  await openExport();report.previewIncludesUnsavedDraft=await evaluate(`document.querySelector('.writing-delivery-dialog iframe').contentDocument.body.innerText.includes('这篇交付方案仍未保存')`);report.previewStructure=await evaluate(`(()=>{const d=document.querySelector('.writing-delivery-dialog iframe').contentDocument;return {headings:d.querySelectorAll('h2').length,tables:d.querySelectorAll('table').length}})()`);assert.deepEqual(report.previewStructure,{headings:70,tables:70});report.previewSha256=sha(Buffer.from(await evaluate(`document.querySelector('.writing-delivery-dialog iframe').srcdoc`)));await capture('installed-v1114-delivery-preview.jpg')
  report.htmlPicker=await picker('导出新文档（不覆盖已有文件）',html,()=>button('独立 HTML…'),'html');await ui.waitFor(`document.querySelector('.writing-delivery-dialog')?.textContent.includes('已导出：')`,'actual HTML write acknowledged')
  const htmlBytes=await fs.readFile(html);report.htmlSha256=sha(htmlBytes);report.htmlCarriesLocalImages=(htmlBytes.toString().match(/src="data:image\/png;base64,/g)||[]).length>=2&&!htmlBytes.toString().includes('blob:');assert.ok(report.htmlCarriesLocalImages);await fs.copyFile(html,path.join(output,'installed-v1114-portable.html'),fs.constants.COPYFILE_EXCL);check(4)
  await fs.copyFile(html,movedHtml,fs.constants.COPYFILE_EXCL);report.movedHtmlSha256=sha(await fs.readFile(movedHtml));report.standalone=await inspectStandaloneDelivery(movedHtml,folder,output);check(5)
  report.cancelPicker=await picker('导出新文档（不覆盖已有文件）',cancel,()=>button('Markdown 仅正文…'),'cancel',true);report.cancelCreatedFile=await fs.access(cancel).then(()=>true,()=>false);assert.equal(report.cancelCreatedFile,false);assert.equal(await evaluate(`!!document.querySelector('.writing-delivery-dialog [role=alert]')`),false);check(6)
  report.markdownPicker=await picker('导出新文档（不覆盖已有文件）',md,()=>button('Markdown 仅正文…'),'markdown');await ui.waitFor(`document.querySelector('.writing-delivery-dialog')?.textContent.includes('已导出：')`,'actual Markdown write acknowledged');const markdown=await fs.readFile(md,'utf8');report.markdownMatchesDraft=markdown===liveDraft;assert.ok(report.markdownMatchesDraft);check(7)
  assert.equal(await evaluate(`document.querySelector('.app-container')?.dataset.windowRole`),'main')
  const tauriConfig=JSON.parse(await fs.readFile(path.join(repoRoot,'src-tauri/tauri.conf.json'),'utf8')),mainWindowTitle=tauriConfig.app.windows.find(w=>!w.label||w.label==='main')?.title
  assert.equal(mainWindowTitle,'Long编辑·md助手')
  const nativeReport=path.join(output,'v1114-native-print.json'),printer=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'scripts/print-hosted-writing-pdf.ps1'),'-Executable',installedExecutable,'-MainWindowTitle',mainWindowTitle,'-QuickNoteWindowTitle','快速笔记','-OwnerRoot',folder,'-Target',pdf,'-Report',nativeReport,'-SelectionReport',path.join(output,'v1114-browser-print-selection.json')],{windowsHide:true,stdio:'inherit'}),printed=new Promise((r,j)=>{printer.once('error',j);printer.once('exit',c=>c===0?r():j(Error('real native PDF print failed '+c)))})
  printed.catch(()=>{})
  const printHost=await withDeadline(async()=>{for(;;){let state;try{state=JSON.parse((await fs.readFile(nativeReport,'utf8')).replace(/^\uFEFF/,''))}catch{}if(state?.status==='ready-for-native-print')return state;if(state?.status==='failed')throw Error(state.failure);await new Promise(r=>setTimeout(r,100))}},30000,'owned printer helper ready')
  await send('Emulation.setDeviceMetricsOverride',{width:printHost.mainWindow.clientWidth,height:printHost.mainWindow.clientHeight,deviceScaleFactor:1,mobile:false})
  report.printViewport=await evaluate('({width:innerWidth,height:innerHeight})');assert.deepEqual(report.printViewport,{width:printHost.mainWindow.clientWidth,height:printHost.mainWindow.clientHeight})
  const printTargets=(async()=>{const samples=[];for(let n=0;n<3;n++){await new Promise(r=>setTimeout(r,2000));try{samples.push({at:new Date().toISOString(),targets:await fetch('http://127.0.0.1:9343/json/list',{signal:AbortSignal.timeout(2000)}).then(r=>r.json())})}catch(error){samples.push({error:String(error)})}await fs.writeFile(path.join(output,'v1114-native-print-targets.json'),JSON.stringify(samples,null,2)+'\n')}})();printTargets.catch(()=>{})
  const browserSelection=selectHostedBrowserPdf(output,sourceCommit,report.harnessSourceCommit);browserSelection.catch(()=>{})
  await button('打印 / PDF…');report.browserPrintSelection=await browserSelection;await withDeadline(()=>printed,100000,'real native PDF print output');report.nativePrint=JSON.parse((await fs.readFile(nativeReport,'utf8')).replace(/^\uFEFF/,''));assert.ok((await fs.readFile(pdf)).subarray(0,5).equals(Buffer.from('%PDF-')));await fs.copyFile(pdf,path.join(output,'installed-v1114-native-print.pdf'),fs.constants.COPYFILE_EXCL);check(8)
  await button('关闭');await navigate('#/library?path='+encodeURIComponent(pdf),'.pdf-view','reopen actual printed PDF');await ui.waitFor(`document.querySelector('#pdf-page-1 .textLayer')?.textContent.includes('这篇交付方案仍未保存')&&!!document.querySelector('#pdf-page-1 canvas')`,'actual printed article text and canvas')
  report.pdfText=await evaluate(`document.querySelector('#pdf-page-1 .textLayer').textContent`);report.pdfPages=Number(await evaluate(`document.querySelector('.page-jump span').textContent.replace(/[^0-9]/g,'')`));report.pdfInk=await evaluate(`(()=>{const c=document.querySelector('#pdf-page-1 canvas'),x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=40)if(d[i+3]>0&&d[i]+d[i+1]+d[i+2]<650)n++;return n})()`);report.nativePdfHasOnlyArticle=report.pdfText.includes('这篇交付方案仍未保存')&&!report.pdfText.includes('快速笔记');await capture('installed-v1114-native-pdf-reopened.jpg');check(9)
  report.pdfColorPixels=await evaluate(`(()=>{const c=document.querySelector('#pdf-page-1 canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=40)if(d[i+3]>0&&Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>60&&Math.min(d[i],d[i+1],d[i+2])<200)n++;return n})()`);assert.ok(report.pdfColorPixels>100,'actual printed PDF must contain the colored bitmap, not only article text')
  await ui.fill('[aria-label="搜索 PDF 正文"]','这是中文文章第 70 段')
  await ui.waitFor(`[...document.querySelectorAll('.textLayer')].some(e=>/这是中文文章第\\s*70\\s*段/.test(e.textContent))`,'the final article section exists in the actual printed PDF, not only its first page')
  report.pdfLastSectionVisible=await evaluate(`[...document.querySelectorAll('.textLayer')].some(e=>/这是中文文章第\\s*70\\s*段/.test(e.textContent))`);await capture('installed-v1114-native-pdf-final-section.jpg')
  for(const[k,file]of Object.entries({source,shared,unselected}))report[k+'After']=sha(await fs.readFile(file))
  report.draftStillDirty=await evaluate(`${tab()}?.isDirty===true&&${tab()}?.content===${q(liveDraft)}`);assert.ok(report.draftStillDirty);check(10)
  await navigate('#/library?path='+encodeURIComponent(source),'.library-mode','return to original unsaved article');await ui.waitFor(`!!(${editor})`,'original editor');if(report.modeBefore!=='sv')await mode(report.modeBefore);report.originalModeRestored=await evaluate(`${store}.editorMode===${q(report.modeBefore)}`)
  report.inputTrace=await evaluate('window.__v1114Trace');report.runtimeErrors=await evaluate('window.__v1114Errors');report.errorOverlay=await evaluate(`!!document.querySelector('.error-overlay')`);check(11);report.status='passed'
  validateInstalledWritingDelivery(report,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]})
 }catch(error){failure=error;report.status='failed';report.failure=String(error.stack||error);await capture('installed-v1114-failure.jpg').catch(()=>{})}
 finally{await fs.writeFile(path.join(output,'installed-v1114-workflow.json'),JSON.stringify(report,null,2)+'\n')}
 if(failure)throw failure
}
