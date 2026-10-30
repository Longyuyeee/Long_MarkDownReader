import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {inlineRepairActions,inlineRepairChecks} from './inline-link-repair-actions.mjs'
import {linkSourceText,linkTargetText} from './inline-link-fixture.mjs'
import {recordLinkSourceInput,linkSourcePathKey} from './installed-v1-3-14-workflow.mjs'
import {inlineLinkRepairOutputFiles,validateInstalledInlineLinkRepair,assertInlineLinkRepairOutputBytes} from './installed-v1-3-15-evidence.mjs'
export async function runInstalledV1315InlineLinkRepairWorkflow({send,evaluate,navigate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 for(const[k,v]of Object.entries({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows',LONGEDIT_R5I_DISPOSABLE:'1'}))assert.equal(process.env[k],v)
 assert.equal(appVersion,'1.3.15');assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const folder=path.join(library,'000-v1315-links-'+crypto.randomUUID()),paths={A:path.join(folder,'A.md'),B:path.join(folder,'B.md'),target:path.join(folder,'资料','新 目标.md'),readonly:path.join(folder,'R.md')},store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`,sha=b=>crypto.createHash('sha256').update(b).digest('hex')
 const r={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),status:'running',evidenceLevel:'installed-inline-link-repair-trusted-input-and-output-bytes',inputProtocol:'trusted-keyboard-and-pointer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:[],outputs:[],viewportWidths:[]},outputs=[]
 let failure
 try{
  await evaluate(`window.__v1315Prior=${store}.tabs.filter(t=>t.isDirty).map(t=>({id:t.id,path:t.path,content:t.content}));(${recordLinkSourceInput.toString()})();window.__v1315Errors=[];window.addEventListener('error',e=>window.__v1315Errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__v1315Errors.push(String(e.reason)))`)
  await fs.mkdir(path.dirname(paths.target),{recursive:true});await fs.writeFile(path.join(folder,'.v119-installed-owner'),'owned inline repair fixture')
  for(const[p,t]of [[paths.A,linkSourceText],[paths.B,'# 磁盘上的其他标题\n']])await fs.writeFile(p,'\uFEFF'+t.replaceAll('\n','\r\n'))
  await fs.writeFile(paths.readonly,linkSourceText);await fs.writeFile(paths.target,linkTargetText);await fs.writeFile(path.join(folder,'资料','无章节.md'),'# 其他标题\n');await fs.writeFile(path.join(folder,'C.json'),'{"target":true}\n');await fs.writeFile(path.join(folder,'D.txt'),'文本目标\n')
  const result=await inlineRepairActions({send,evaluate,navigate,capture,paths,read:p=>fs.readFile(p,'utf8'),write:async(p,t)=>{if(t===null)await fs.unlink(p);else await fs.writeFile(p,t)},readOnly:(p,yes)=>fs.chmod(p,yes?0o444:0o666)})
  r.checks=inlineRepairChecks.map(id=>({id,status:result.observations[id]?'passed':'failed'}));r.viewportWidths=[1280,800]
  r.otherDraftsPreserved=await evaluate(`window.__v1315Prior.every(p=>${store}.tabs.some(t=>t.id===p.id&&t.path===p.path&&t.content===p.content&&t.isDirty))`)
  r.disposableDraftsExplicitlySaved=await evaluate(`!${store}.tabs.some(t=>(${linkSourcePathKey.toString()})(t.path).startsWith(${JSON.stringify(linkSourcePathKey(folder))})&&t.isDirty)`)
  r.inputTrace=await evaluate('window.__v1314Trace');r.runtimeErrors=await evaluate('window.__v1315Errors');r.errorOverlay=await evaluate('!!document.querySelector("#crash-screen,.global-error-overlay,.startup-fatal-screen,.route-error-fallback")')
  for(const[fileName,bytes]of [[inlineLinkRepairOutputFiles[0],Buffer.from(JSON.stringify(result.observations,null,2))],[inlineLinkRepairOutputFiles[1],await fs.readFile(paths.A)],[inlineLinkRepairOutputFiles[2],await fs.readFile(paths.B)]]){outputs.push([fileName,bytes]);await fs.writeFile(path.join(output,fileName),bytes,{flag:'wx'});r.outputs.push({fileName,sizeBytes:bytes.length,sha256:sha(bytes)})}
  r.status='passed';validateInstalledInlineLinkRepair(r,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});assertInlineLinkRepairOutputBytes(r,n=>outputs.find(([file])=>file===n)[1])
 }catch(error){failure=error;r.status='failed';r.failure=String(error.stack||error);r.failureUI=await evaluate('({hash:location.hash,focused:document.activeElement?.outerHTML.slice(0,300),body:document.body.innerText.slice(-6000)})').catch(()=>null);await capture('installed-v1315-links-failure.jpg').catch(()=>{})}
 finally{await send('Emulation.clearDeviceMetricsOverride',{}).catch(()=>{});await fs.chmod(paths.readonly,0o666).catch(()=>{});await fs.writeFile(path.join(output,'installed-v1315-links-workflow.json'),JSON.stringify(r,null,2)+'\n')}
 if(failure)throw failure
}
