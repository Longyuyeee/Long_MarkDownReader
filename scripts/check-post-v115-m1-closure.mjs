import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = readJson('shared/post-v115-m1-closure-policy.json')
const evidence = readJson('docs/evidence/post-v115-m1-closure/runtime-evidence.json')
const formats = readJson('shared/file-formats.json')
const matrix = readJson('shared/release-capability-matrix.json')
const docx = readJson('docs/evidence/post-v115-m1b2c-docx-closure/native-roundtrip.json')
const readme = fs.readFileSync('README.md', 'utf8')
const releaseDraft = fs.readFileSync('docs/RELEASE_NOTES_v1.0.16_DRAFT.md', 'utf8')
const audit = fs.readFileSync('docs/Post_v1.0.15_M1_Total_Exit_Criteria_Audit_2026-08-27.md', 'utf8')
const script = fs.readFileSync('scripts/run-post-v115-m1b1c-pptx-drafts-audit.ps1', 'utf8')

const format = id => formats.formats.find(item => item.id === id)
const mediaProfile = matrix.profiles.find(item => item.id === 'media-preview')
const checks = {
  acceptedPolicy: policy.status === 'accepted'
    && policy.acceptedTracks.join(',') === 'M1A-xlsx,M1B-office,M1C-ods,M1D-media-structured'
    && policy.releaseCandidate === false,
  freshRealEvidence: evidence.status === 'passed' && evidence.passed === true
    && evidence.actual.xlsx.runtimeErrors === 0
    && evidence.actual.pptx.runtimeErrors === 0
    && evidence.actual.ods.runtimeErrors === 0
    && evidence.actual.largeJson.runtimeErrors === 0
    && evidence.actual.videoFrames.runtimeErrors === 0
    && evidence.actual.videoSubtitles.runtimeErrors === 0,
  externalProducerEvidence: docx.status === 'passed'
    && docx.actual.verifiedProducers === 3
    && docx.actual.producerSourcePairs === 9
    && docx.actual.stablePairs === 9
    && evidence.actual.docx.longEditReverseReads === 9,
  sourceSafety: evidence.actual.xlsx.repositoryFixtureUnchanged === true
    && evidence.actual.pptx.sourceUnchangedBeforeSave === true
    && evidence.actual.ods.sourceUnchanged === true
    && evidence.actual.largeJson.sourceUnchanged === true
    && evidence.actual.videoFrames.sourceUnchanged === true
    && evidence.actual.videoSubtitles.sourceUnchanged === true,
  formatFactsAligned: format('json').userCapability.description.includes('渐进只读模式')
    && format('video').userCapability.description.includes('VTT/SRT 字幕')
    && format('docx').userCapability.description.includes('已有段落样式')
    && format('ods').userCapability.description.includes('已有命名样式')
    && mediaProfile.knownLimitations[0].includes('嵌入字幕拆封'),
  userDocsAligned: readme.includes('## 1.0.16 开发中（尚未发布）')
    && readme.includes('大 JSON 渐进只读')
    && readme.includes('同名 VTT/SRT 字幕')
    && releaseDraft.includes('不是公开 Release')
    && releaseDraft.includes('Schema provider/mapping'),
  auditAligned: audit.includes('## 3. 预期与实际差异')
    && audit.includes('M3 知识图谱 2.0 选择审计')
    && audit.includes('60 秒内没有发现 CDP'),
  harnessCorrected: script.includes('param([switch]$SkipBuild)')
    && script.includes('tauri.e2e.conf.json')
    && script.includes('if(-not $SkipBuild)'),
  nextStageAligned: policy.selectedNextStage === 'M3-knowledge-graph-2.0-selection-audit',
}

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
if (failed.length) throw new Error(`M1 total exit gate failed: ${failed.join(', ')}`)
console.log('M1 total exit criteria accepted: M1A-M1D real evidence, producer matrix, source safety, boundaries and user documentation are aligned.')
