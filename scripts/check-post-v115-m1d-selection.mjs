import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = readJson('shared/post-v115-m1d-selection-policy.json')
const runtime = readJson('docs/evidence/post-v115-m1d-selection/runtime-evidence.json')
const audit = readJson('docs/evidence/post-v115-m1d-selection/audit.json')
const capture = fs.readFileSync('scripts/capture-post-v115-m1d-selection-audit.mjs', 'utf8')
const failures = []

if (policy.status !== 'accepted-selection' || policy.selectedNextStage !== 'M1D-A-large-json-progressive-read-search') failures.push('selection policy')
if (policy.releaseCandidate !== false || audit.decision?.releaseCandidate !== false) failures.push('release boundary')
if (runtime.stage !== policy.stage || runtime.status !== 'passed' || runtime.passed !== true) failures.push('runtime status')
const structured = runtime.actual?.structured
const media = runtime.actual?.media
if (structured?.json10Bytes !== 10 * 1024 * 1024 || structured?.json10Outcome?.status !== 'unresponsive-timeout' || structured.json10Outcome.openMs < 30_000) failures.push('10 MiB actual gap')
if (structured?.json10Outcome?.error?.includes('Users') || structured?.json10Outcome?.error?.includes('M1D_END_MARKER')) failures.push('runtime evidence privacy')
if (structured?.json50Bytes !== 50 * 1024 * 1024 || structured?.json50BlockMs >= 3_000 || !structured?.json50Error?.includes('读取上限')) failures.push('50 MiB boundary')
if (!structured?.sourceUnchanged) failures.push('structured source preservation')
if (media?.media1080?.width !== 1920 || media?.media1080?.height !== 1080 || media?.media1080?.readyState !== 4) failures.push('1080p result')
if (media?.media4k?.width !== 3840 || media?.media4k?.height !== 2160 || media?.media4k?.readyState !== 4 || media?.media4k?.pageOverflow !== 0) failures.push('4K result')
if (!media?.invalidCodecText?.includes('缺少该视频的编解码器') || runtime.actual?.runtimeErrorCount !== 0) failures.push('media failure/runtime result')
if (audit.status !== 'passed' || audit.decision?.selectedNextStage !== policy.selectedNextStage || audit.privacy?.localAbsolutePathsIncluded !== false) failures.push('audit decision/privacy')
for (const file of audit.evidenceFiles ?? []) if (!fs.existsSync(`docs/evidence/post-v115-m1d-selection/${file}`)) failures.push(`missing evidence: ${file}`)
for (const token of ['createLargeJson', 'MediaRecorder', 'CDP command', 'sourceHashesBefore', 'unresponsive-timeout']) if (!capture.includes(token)) failures.push(`capture token: ${token}`)

if (failures.length) {
  console.error(`M1D selection contract failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('M1D selection accepted: 10 MiB JSON timeout and 50 MiB boundary select progressive large-JSON reading before media frame tools.')
