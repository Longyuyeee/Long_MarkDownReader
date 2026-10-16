import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import crypto from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import { assertInstalledReleaseRuntime } from './lib/installed-release-runtime.mjs'
import { moveContinuityChecks } from './lib/installed-v1-1-6-workflow.mjs'
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function fixture() {
  // Synthetic validator input only; no historical evidence file is changed.
  const manifest = JSON.parse(fs.readFileSync('docs/evidence/v1.1.5-release/artifact-manifest.json','utf8')), bytes = new Map()
  manifest.appVersion = manifest.sourceVersion = '1.1.6'
  for(const item of Object.values(manifest.runtimeSmoke.reports)) {
    const data=JSON.parse(fs.readFileSync(item.path,'utf8'));if(data.appVersion)data.appVersion='1.1.6'
    if(data.observations)for(const key of Object.keys(data.observations))if(typeof data.observations[key]==='string')data.observations[key]=data.observations[key].replaceAll('1.1.5','1.1.6')
    item.path=item.path.replace('v1-1-5-candidate-lifecycle','v1-1-6-candidate-lifecycle');const encoded=Buffer.from(JSON.stringify(data));item.sha256=sha(encoded);bytes.set(item.path,encoded)
  }
  const report={appVersion:'1.1.6',sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(item=>item.target==='nsis').sha256,status:'passed',evidenceLevel:'installed-tauri-ipc-and-disk',sourceUserContentIncluded:false,checks:moveContinuityChecks.map(id=>({id,status:'passed'}))}
  const update=()=>{const file='docs/evidence/v1-1-6-candidate-lifecycle/installed-v116-workflow.json',encoded=Buffer.from(JSON.stringify(report));bytes.set(file,encoded);manifest.runtimeSmoke.reports.moveContinuity={path:file,sha256:sha(encoded)}}
  update();return {manifest,report,update,read:file=>bytes.get(file)}
}
test('v116 requires its own complete installed move evidence in addition to retained workflows',()=>{
  const f=fixture();assert.doesNotThrow(()=>assertInstalledReleaseRuntime(f.manifest,f.read));delete f.manifest.runtimeSmoke.reports.moveContinuity;assert.throws(()=>assertInstalledReleaseRuntime(f.manifest,f.read))
})
test('v116 rejects a missing task, wrong installer or different product source',()=>{
  for(const change of [report=>report.checks.pop(),report=>report.installerSha256='0'.repeat(64),report=>report.sourceCommit='0'.repeat(40)]){const f=fixture();change(f.report);f.update();assert.throws(()=>assertInstalledReleaseRuntime(f.manifest,f.read))}
})
test('v116 still requires actual predecessor workflow reports',()=>{
  const f=fixture();delete f.manifest.runtimeSmoke.reports.foundationHardening;assert.throws(()=>assertInstalledReleaseRuntime(f.manifest,f.read))
})
test('installed draft observation handles Windows device paths and emits valid page JavaScript', async()=>{
  const source=fs.readFileSync('scripts/lib/installed-v1-1-6-workflow.mjs','utf8'),ast=ts.createSourceFile('workflow.mjs',source,ts.ScriptTarget.Latest,true);let initializer
  const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='currentDraft')initializer=node.initializer.getText(ast);ts.forEachChild(node,visit)};visit(ast)
  const value=vm.runInNewContext(initializer,{store:'testStore',normalize:value=>value.replaceAll('\\','/').toLowerCase(),evaluate:expression=>vm.runInNewContext(expression,{testStore:{tabs:[{path:'\\\\?\\C:\\资料\\note.md',content:'retained draft'}]}})})
  assert.equal(await value('C:\\资料\\note.md'),'retained draft')
})
