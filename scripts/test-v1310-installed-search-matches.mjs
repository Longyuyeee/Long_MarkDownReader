import assert from 'node:assert/strict'
import {test} from 'node:test'
import crypto from 'node:crypto'
import {positionDraft} from './lib/structured-source-position-fixture.mjs'
import {sourceMatchesChecks,sourceMatchesOutputFiles,validateInstalledSourceMatches,assertSourceMatchesOutputBytes} from './lib/installed-v1-3-10-evidence.mjs'
const manifest={appVersion:'1.3.10',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]}
function fixture(){
 const bytes=new Map([[sourceMatchesOutputFiles[0],Buffer.from(JSON.stringify(Object.fromEntries(sourceMatchesChecks.map(id=>[id,true]))))]])
 for(const[mode,i]of ['json','yaml','xml','toml'].map((m,i)=>[m,i+1]))bytes.set(sourceMatchesOutputFiles[i],Buffer.from('\uFEFF'+positionDraft(mode).replaceAll('\n','\r\n')))
 const r={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-search-matches-trusted-input-and-output-bytes',inputProtocol:'trusted-keyboard-and-pointer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:sourceMatchesChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:25},()=>({type:'keydown',trusted:true})),otherDraftsPreserved:true,disposableDraftsExplicitlySaved:true,viewportWidths:[1280,800],modes:['json','yaml','xml','toml'].map(mode=>({mode,...Object.fromEntries(['pagedExact','navigationExact','undoRedoExact','cancelExact','scopeExact','explicitSaveExact','ownerResetExact','readOnlyExact'].map(k=>[k,true]))})),outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}))}
 return{r,bytes}
}
test('current installed match report requires trusted navigation and exact saved source bytes',()=>{const{r,bytes}=fixture();validateInstalledSourceMatches(r,manifest);assertSourceMatchesOutputBytes(r,n=>bytes.get(n))})
test('wrong owner, lost drafts, readonly failures, synthetic input and edited output are rejected',()=>{
 for(const mutate of [r=>r.sourceCommit='e'.repeat(40),r=>r.nativeBridgeMocked=true,r=>r.otherDraftsPreserved=false,r=>r.modes[0].readOnlyExact=false,r=>r.modes[1].undoRedoExact=false,r=>r.inputTrace[0].trusted=false,r=>r.runtimeErrors.push('error'),r=>r.checks.pop()]){const{r}=fixture();mutate(r);assert.throws(()=>validateInstalledSourceMatches(r,manifest))}
 const{r,bytes}=fixture();bytes.set(sourceMatchesOutputFiles[1],Buffer.from('changed draft'));assert.throws(()=>assertSourceMatchesOutputBytes(r,n=>bytes.get(n)))
})
