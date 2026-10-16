import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import crypto from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import { assertInstalledReleaseRuntime } from './lib/installed-release-runtime.mjs'
import { saveHistoryChecks as moveContinuityChecks } from './lib/installed-v1-1-7-workflow.mjs'
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function fixture() {
  // Synthetic validator input only; no historical evidence file is changed.
  const manifest = JSON.parse(fs.readFileSync('docs/evidence/v1.1.6-release/artifact-manifest.json','utf8')), bytes = new Map()
  manifest.appVersion = manifest.sourceVersion = '1.1.7'
  for(const item of Object.values(manifest.runtimeSmoke.reports)) {
    const data=JSON.parse(fs.readFileSync(item.path,'utf8'));if(data.appVersion)data.appVersion='1.1.7'
    if(data.observations)for(const key of Object.keys(data.observations))if(typeof data.observations[key]==='string')data.observations[key]=data.observations[key].replaceAll('1.1.6','1.1.7')
    item.path=item.path.replace('v1-1-6-candidate-lifecycle','v1-1-7-candidate-lifecycle');const encoded=Buffer.from(JSON.stringify(data));item.sha256=sha(encoded);bytes.set(item.path,encoded)
  }
  const report={appVersion:'1.1.7',sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(item=>item.target==='nsis').sha256,status:'passed',evidenceLevel:'installed-tauri-ipc-and-disk',sourceUserContentIncluded:false,checks:moveContinuityChecks.map(id=>({id,status:'passed'}))}
  const update=()=>{const file='docs/evidence/v1-1-7-candidate-lifecycle/installed-v117-workflow.json',encoded=Buffer.from(JSON.stringify(report));bytes.set(file,encoded);manifest.runtimeSmoke.reports.saveHistory={path:file,sha256:sha(encoded)}}
  update();return {manifest,report,update,read:file=>bytes.get(file)}
}
test('v117 requires its own complete installed save/history evidence in addition to retained workflows',()=>{
  const f=fixture();assert.doesNotThrow(()=>assertInstalledReleaseRuntime(f.manifest,f.read));delete f.manifest.runtimeSmoke.reports.saveHistory;assert.throws(()=>assertInstalledReleaseRuntime(f.manifest,f.read))
})
test('v117 rejects a missing task, wrong installer or different product source',()=>{
  for(const change of [report=>report.checks.pop(),report=>report.installerSha256='0'.repeat(64),report=>report.sourceCommit='0'.repeat(40)]){const f=fixture();change(f.report);f.update();assert.throws(()=>assertInstalledReleaseRuntime(f.manifest,f.read))}
})
test('v117 still requires actual predecessor workflow reports',()=>{
  const f=fixture();delete f.manifest.runtimeSmoke.reports.foundationHardening;assert.throws(()=>assertInstalledReleaseRuntime(f.manifest,f.read))
})
