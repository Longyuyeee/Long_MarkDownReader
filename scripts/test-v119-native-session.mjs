import assert from 'node:assert/strict'
import {test} from 'node:test'
import fs from 'node:fs'
import {assertSessionHosted,sessionFixturePaths,sessionProductCommit,validateNativeSessionReport,baselineSessionChecks,restartSessionChecks} from './lib/v119-native-session-fixture.mjs'
const report=phase=>({phase,status:'passed',productCommit:sessionProductCommit,harnessCommit:'a'.repeat(40),executableSha256:'b'.repeat(64),runtimeBaseVersion:'1.1.8',evidenceLevel:'debug-tauri-wry-real-session-ipc-not-installed',releaseCandidate:false,isInstaller:false,sourceUserContentIncluded:false,desktopInputUsed:false,checks:phase==='baseline'?[...baselineSessionChecks]:[...restartSessionChecks],calls:phase==='baseline'?[...Array.from({length:20},()=>({window:'main',command:'read_work_session_bundle',ok:true})),...['export_work_session_bundle','read_work_session_bundle','preflight_work_session','locate_work_session_file'].flatMap(command=>[{window:'main',command,ok:true},{window:'quick-note',command,ok:false}])]:Array.from({length:3},()=>({window:'main',command:'read_work_session_bundle',ok:true}))})
test('native session driver refuses a user or self-hosted machine',()=>{
 const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows'};assert.doesNotThrow(()=>assertSessionHosted(env))
 for(const update of [{GITHUB_ACTIONS:'false'},{RUNNER_ENVIRONMENT:'self-hosted'},{RUNNER_OS:'Linux'}])assert.throws(()=>assertSessionHosted({...env,...update}))
 for(const root of ['C:/','C:/Users/Administrator','relative/longedit-v119-session-owned'])assert.throws(()=>sessionFixturePaths(root))
 assert.ok(sessionFixturePaths('C:/temp/longedit-v119-session-owned').target.endsWith('新资料 & 中文'))
})
test('evidence requires every real native check, exact source/runtime and secondary-window denial',()=>{
 for(const phase of ['baseline','restart'])assert.equal(validateNativeSessionReport(report(phase),phase).status,'passed')
 for(const mutate of [r=>r.checks.pop(),r=>r.productCommit='c'.repeat(40),r=>r.runtimeBaseVersion='1.1.9',r=>r.isInstaller=true,r=>r.releaseCandidate=true,r=>r.evidenceLevel='browser-mock',r=>r.calls=r.calls.filter(call=>call.window!=='quick-note'),r=>r.executableSha256='',r=>r.status='failed']){const r=report('baseline');mutate(r);assert.throws(()=>validateNativeSessionReport(r,'baseline'))}
})
test('workflow and runner use fixed product and isolated hosted-only process lifecycle',()=>{
 const workflow=fs.readFileSync('.github/workflows/v119-session-native.yml','utf8'),runner=fs.readFileSync('scripts/run-v119-native-session.ps1','utf8')
 assert.ok(workflow.includes('ref: '+sessionProductCommit));assert.ok(runner.includes("$expectedCommit='"+sessionProductCommit+"'"))
 for(const token of ['github-hosted','--minimized','-WindowStyle Hidden',"@('baseline','restart')",'Disable-V118WebViewTestPolicy','--untracked-files=no'])assert.ok(runner.includes(token),token)
 assert.doesNotMatch(runner,/Remove-Item.*-Recurse|Get-NetTCPConnection.*Stop-Process/)
})
