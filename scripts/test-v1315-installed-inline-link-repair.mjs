import assert from 'node:assert/strict'
import {test} from 'node:test'
import crypto from 'node:crypto'
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
