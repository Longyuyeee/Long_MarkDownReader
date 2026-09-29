import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { assertInstalledReleaseRuntime } from './lib/installed-release-runtime.mjs'
const fixture = () => JSON.parse(fs.readFileSync('docs/evidence/v1.0.22-release/artifact-manifest.json'))

test('v1.0.23 uses the reviewed immutable follow-up, not the initial invisible capture', () => {
  const manifest = JSON.parse(fs.readFileSync('docs/evidence/v1.0.23-release/artifact-manifest.json'))
  assertInstalledReleaseRuntime(manifest)
  manifest.runtimeSmoke.reports.version.path = 'docs/evidence/v123-candidate-lifecycle/installed-version-identity.json'
  assert.throws(() => assertInstalledReleaseRuntime(manifest))
})
test('release uses real immutable installed reports, not invented debug counts', () => {
  assert.doesNotThrow(() => assertInstalledReleaseRuntime(fixture()))
})
for (const kind of ['bytes', 'version', 'installer', 'source', 'failed-check', 'missing-save', 'crashed-route']) {
  test(`installed release rejects ${kind}`, () => {
    const m = fixture()
    if (kind === 'version') m.appVersion = '1.0.21'
    if (kind === 'installer') m.artifacts.find(a => a.target === 'nsis').sha256 = '0'.repeat(64)
    if (kind === 'source') m.sourceCommit = '0'.repeat(40)
    const read = file => {
      const original = fs.readFileSync(file)
      if (kind === 'bytes') return Buffer.concat([original, Buffer.from(' ')])
      const report = JSON.parse(original)
      if (kind === 'failed-check' && report.checks) report.checks[0].status = 'failed'
      if (kind === 'missing-save' && report.checks) report.checks = report.checks.filter(c => c.id !== 'installed-txt-read-edit-save-reopen')
      if (kind === 'crashed-route' && report.routes) report.routes[0].crashFallbackVisible = true
      const bytes = Buffer.from(JSON.stringify(report))
      Object.values(m.runtimeSmoke.reports).find(item => item.path === file).sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
      return bytes
    }
    assert.throws(() => assertInstalledReleaseRuntime(m, read))
  })
}

// In-memory synthetic records exercise the new validator, never installed evidence.
function versionCandidateFixture() {
  const m = fixture()
  m.appVersion = '1.0.23'
  const original = m.runtimeSmoke.reports
  const workspace = JSON.parse(fs.readFileSync(original.workspace.path))
  workspace.appVersion = '1.0.23'
  const routes = JSON.parse(fs.readFileSync(original.routes.path))
  const version = {
    sourceCommit: m.sourceCommit, installerSha256: workspace.installerSha256, appVersion: '1.0.23',
    sourceUserContentIncluded: false, evidenceLevel: 'installed-webview-input-events', status: 'passed',
    checks: ['native-version-and-sidebar', 'badge-opens-settings', 'real-update-preserves-installed-version', 'production-capability-no-dev'].map(id=>({id,status:'passed'})),
    observations: { nativeVersion:'1.0.23', badge:'v1.0.23', badgeLabel:'当前软件版本 v1.0.23', settingsRoute:'#/settings?focus=software-update', settings:'当前版本 v1.0.23', checkedSettings:'当前已是最新版本 v1.0.23', capabilities:'v1.0.23 社区版 · 未签名' },
  }
  return { m, records: { workspace, routes, version } }
}
function validateSynthetic(f, corruptBytes = false) {
  const bytes = new Map()
  f.m.runtimeSmoke.reports = Object.fromEntries(Object.entries(f.records).map(([name, record])=> {
    const file = `docs/evidence/${f.m.appVersion === "1.0.24" ? "v124-candidate-lifecycle" : "v123-installed-visual-review"}/${name}.json`
    const buffer = Buffer.from(JSON.stringify(record))
    bytes.set(file, buffer)
    return [name, { path:file, sha256:crypto.createHash('sha256').update(buffer).digest('hex') }]
  }))
  assertInstalledReleaseRuntime(f.m, file=>corruptBytes ? Buffer.from('changed') : bytes.get(file))
}
test('v1.0.23 synthetic validator requires installed reports, not debug evidence', ()=> validateSynthetic(versionCandidateFixture()))
for (const kind of ['old-native-version','dev-marker','wrong-source','wrong-installer','failed-check','missing-version-report','changed-bytes','debug-status']) {
  test(`v1.0.23 rejects ${kind}`, ()=> {
    const f=versionCandidateFixture()
    if(kind==='old-native-version') f.records.version.observations.nativeVersion='1.0.22'
    if(kind==='dev-marker') f.records.version.observations.capabilities+=' DEV'
    if(kind==='wrong-source') f.records.version.sourceCommit='0'.repeat(40)
    if(kind==='wrong-installer') f.records.version.installerSha256='0'.repeat(64)
    if(kind==='failed-check') f.records.version.checks[0].status='failed'
    if(kind==='missing-version-report') delete f.records.version
    if(kind==='debug-status') f.m.runtimeSmoke.status='passed-real-tauri-debug-webview2'
    assert.throws(()=>validateSynthetic(f,kind==='changed-bytes'))
  })
}

function stabilityFixture() {
  const f = JSON.parse(JSON.stringify(versionCandidateFixture()).replaceAll('1.0.23','1.0.24'))
  f.records.stability = {
    appVersion:'1.0.24',sourceCommit:f.m.sourceCommit,installerSha256:f.records.workspace.installerSha256,
    status:'passed',sourceUserContentIncluded:false,
    markdown:{status:'passed',activeAnimations:0,headings:225,typingVisible:true},
    observations: [[1280,820,false],[1280,820,true],[720,600,false],[720,600,true]].map(([width,height,expanded])=>({
      id:'graph-layout',status:'passed',width,height,expanded,tutorialUnobscured:true,
      rects:{options:{bottom:60},legend:{top:66,bottom:100},banner:{top:106,bottom:120},canvas:{top:126},tutorial:{top:130,bottom:500}}
    })).concat([{id:'native-close-cancel-preserves-draft',status:'passed',syntheticDraft:true}])
  }
  return f
}
test('v1.0.24 requires its own stability observations',()=>validateSynthetic(stabilityFixture()))
for (const kind of ['missing-stability','wrong-source','legend-overlap','tutorial-overflow','tutorial-obscured','missing-viewport','missing-close','animated-markdown','missing-markdown-input']) {
  test(`v1.0.24 rejects ${kind}`,()=>{
    const f=stabilityFixture()
    if(kind==='missing-stability') delete f.records.stability
    if(kind==='wrong-source') f.records.stability.sourceCommit='0'.repeat(40)
    if(kind==='legend-overlap') f.records.stability.observations[0].rects.legend.bottom=300
    if(kind==='tutorial-overflow') f.records.stability.observations[0].rects.tutorial.bottom=900
    if(kind==='tutorial-obscured') f.records.stability.observations[0].tutorialUnobscured=false
    if(kind==='missing-viewport') f.records.stability.observations[2].width=1280
    if(kind==='missing-close') f.records.stability.observations.pop()
    if(kind==='animated-markdown') f.records.stability.markdown.activeAnimations=1
    if(kind==='missing-markdown-input') f.records.stability.markdown.typingVisible=false
    assert.throws(()=>validateSynthetic(f))
  })
}
