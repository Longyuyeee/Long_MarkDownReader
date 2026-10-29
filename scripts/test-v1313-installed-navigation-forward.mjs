import assert from 'node:assert/strict'
import {test} from 'node:test'
import crypto from 'node:crypto'
import {positionDraft} from './lib/structured-source-position-fixture.mjs'
import {navigationForwardChecks,navigationForwardOutputFiles,validateInstalledNavigationForward,assertNavigationForwardOutputBytes} from './lib/installed-v1-3-13-evidence.mjs'
const manifest={appVersion:'1.3.13',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]}
function fixture(){
 const bytes=new Map([[navigationForwardOutputFiles[0],Buffer.from(JSON.stringify(Object.fromEntries(navigationForwardChecks.map(id=>[id,true]))))]])
 for(const[mode,i]of ['json','yaml','xml','toml'].map((m,i)=>[m,i+1]))bytes.set(navigationForwardOutputFiles[i],Buffer.from('\uFEFF'+positionDraft(mode).replaceAll('\n','\r\n')))
 const r={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-navigation-forward-trusted-input-and-output-bytes',inputProtocol:'trusted-keyboard-and-pointer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:navigationForwardChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:25},()=>({type:'keydown',trusted:true})),otherDraftsPreserved:true,disposableDraftsExplicitlySaved:true,viewportWidths:[1280,800],modes:['json','yaml','xml','toml'].map(mode=>({mode,...Object.fromEntries(['forwardExact','filterExact','searchForwardExact','branchResetExact','mappedForwardExact','undoRedoExact','explicitSaveExact','ownerResetExact','readOnlyExact','viewportExact','nestedTreeHistoryExact','treeForwardExact','collapsePreservedExact','invalidTreeFallbackExact'].map(k=>[k,true]))})),outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}))}
 return{r,bytes}
}
test('current installed forward report requires trusted navigation and exact saved source bytes',()=>{const{r,bytes}=fixture();validateInstalledNavigationForward(r,manifest);assertNavigationForwardOutputBytes(r,n=>bytes.get(n))})
test('wrong owner, lost drafts, readonly failures, synthetic input and edited output are rejected',()=>{
 for(const mutate of [r=>r.sourceCommit='e'.repeat(40),r=>r.nativeBridgeMocked=true,r=>r.otherDraftsPreserved=false,r=>r.modes[0].readOnlyExact=false,r=>r.modes[0].mappedForwardExact=false,r=>r.modes[0].collapsePreservedExact=false,r=>r.modes[0].nestedTreeHistoryExact=false,r=>r.modes[0].forwardExact=false,r=>r.modes[1].undoRedoExact=false,r=>r.inputTrace[0].trusted=false,r=>r.runtimeErrors.push('error'),r=>r.checks.pop()]){const{r}=fixture();mutate(r);assert.throws(()=>validateInstalledNavigationForward(r,manifest))}
 const{r,bytes}=fixture();bytes.set(navigationForwardOutputFiles[1],Buffer.from('changed draft'));assert.throws(()=>assertNavigationForwardOutputBytes(r,n=>bytes.get(n)))
})
