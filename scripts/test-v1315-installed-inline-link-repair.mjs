import assert from 'node:assert/strict'
import {test} from 'node:test'
import crypto from 'node:crypto'
import vm from 'node:vm'
import {inlineLinkRepairChecks,inlineLinkRepairOutputFiles,validateInstalledInlineLinkRepair,assertInlineLinkRepairOutputBytes} from './lib/installed-v1-3-15-evidence.mjs'
import {linkSourceText,replacedSource} from './lib/inline-link-fixture.mjs'
const manifest={appVersion:'1.3.15',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]}
function fixture(){
 const values=[JSON.stringify(Object.fromEntries(inlineLinkRepairChecks.map(id=>[id,true]))),'\uFEFF'+replacedSource(linkSourceText.trimEnd()+'草稿保留。\n').replaceAll('\n','\r\n'),'\uFEFF# 本周任务\r\n\r\n目标草稿保留。\r\n'],bytes=new Map(inlineLinkRepairOutputFiles.map((name,i)=>[name,Buffer.from(values[i])]))
 return{bytes,r:{...manifest,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-inline-link-repair-trusted-input-and-output-bytes',inputProtocol:'trusted-keyboard-and-pointer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:inlineLinkRepairChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:25},(_,i)=>({type:i%2?'keydown':'pointerdown',trusted:true})),otherDraftsPreserved:true,disposableDraftsExplicitlySaved:true,viewportWidths:[1280,800],outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}))}}
}
test('current installed repair proof binds real input, all scenarios and exact BOM / CRLF output',()=>{const{r,bytes}=fixture();validateInstalledInlineLinkRepair(r,manifest);assertInlineLinkRepairOutputBytes(r,n=>bytes.get(n))})
test('stale reports, synthetic input, false results and unrelated source edits are rejected',()=>{
 for(const change of [r=>r.sourceCommit='e'.repeat(40),r=>r.nativeBridgeMocked=true,r=>r.otherDraftsPreserved=false,r=>r.inputTrace[0].trusted=false,r=>r.runtimeErrors.push('failure'),r=>r.checks.pop()]){const{r}=fixture();change(r);assert.throws(()=>validateInstalledInlineLinkRepair(r,manifest))}
 const{r,bytes}=fixture();bytes.set(inlineLinkRepairOutputFiles[1],Buffer.from('unrelated content'));assert.throws(()=>assertInlineLinkRepairOutputBytes(r,n=>bytes.get(n)))
})


test('picker queries the exact relative fixture path even with duplicate filenames',async()=>{
 const {inlineRepairTargetRelative}=await import('./lib/inline-link-repair-actions.mjs')
 const paths={libraryRoot:'C:\\LongEditR5ILibrary',A:'\\\\?\\C:\\LongEditR5ILibrary\\owned-uuid\\A.md',target:'C:\\LongEditR5ILibrary\\owned-uuid\\资料\\新 目标.md'}
 assert.equal(inlineRepairTargetRelative(paths,'B.md'),'owned-uuid/b.md');assert.equal(inlineRepairTargetRelative(paths,'新 目标.md'),'owned-uuid/资料/新 目标.md')
})
test('waiting for native feedback tolerates an absent toast and selects only the visible matching notice',async()=>{
 const {inlineRepairNotice}=await import('./lib/inline-link-repair-actions.mjs'),expression=inlineRepairNotice('更换目标')
 const notice=(textContent,visible=true)=>({textContent,getClientRects:()=>visible?[{}]:[]})
 for(const[nodes,expected]of [[[],false],[[notice('其他提示')],false],[[notice('更换目标',false)],false],[[notice('其他提示'),notice('文件不可用，更换目标')],true]])assert.equal(vm.runInNewContext(expression,{document:{querySelectorAll:()=>nodes}}),expected)
})
