import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const fail = message => { console.error(message); process.exit(1) }
const closure = json('shared/p1-final-capability-closure.json')
const release = json('shared/release-capability-matrix.json')
const registry = json('shared/file-formats.json')
const advancedPdf = json('shared/pdf-advanced-editing-contract.json')
const graph = json('shared/g9-knowledge-graph-pulse-policy.json')
const crossFormatGraph = json('shared/g10-cross-format-graph-acceptance-policy.json')
const packageJson = json('package.json')
const audit = read('docs/P1_Final_Capability_Closure_Audit_2026-08-16.md')
const plan = read('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md')
const handoff = read('docs/Development_Handoff.md')

if (closure.stage !== 'P1-FINAL' || closure.status !== 'accepted-bounded-ready-for-patch-release' || closure.appVersion !== packageJson.version || closure.releaseCandidate !== false || closure.nextStage !== 'V1.0.11-UNSIGNED-PATCH-RELEASE') fail('P1 final identity is stale')
const readiness = release.formats.reduce((counts, item) => ({ ...counts, [item.readiness]: (counts[item.readiness] || 0) + 1 }), {})
const extensionCount = registry.formats.reduce((sum, item) => sum + item.extensions.length, 0)
const expected = { registeredFormats: registry.formats.length, registeredExtensions: extensionCount, verifiedFormats: readiness.verified, limitedFormats: readiness['verified-with-limitations'], externalDependencyFormats: readiness['external-dependency'], releaseProfiles: release.profiles.length }
for (const [key, value] of Object.entries(expected)) if (closure.frozenBaseline?.[key] !== value) fail(`P1 final baseline drift: ${key}`)
if (release.formats.length !== registry.formats.length || release.appVersion !== packageJson.version) fail('P1 release registry alignment is stale')
for (const id of ['library-management', 'developer-and-structured-text', 'diagram-and-mind-map', 'knowledge-graph', 'pdf', 'office-and-spreadsheet', 'media']) if (!closure.acceptedProductLanes?.find(item => item.id === id)?.status.startsWith('accepted')) fail(`P1 accepted lane missing: ${id}`)
for (const claim of ['all-43-formats-have-equal-editing-depth', 'full-microsoft-office-or-wps-equivalence', 'knowledge-graph-is-the-same-as-a-freeform-mind-map-editor']) if (!closure.explicitNonClaims?.includes(claim)) fail(`P1 non-claim missing: ${claim}`)
if (advancedPdf.stage !== 'P1-B5D' || advancedPdf.status !== 'metadata-complete' || advancedPdf.plannedSlices?.some(item => ['P1-B3', 'P1-B4', 'P1-B5'].includes(item.id) && item.status !== 'completed')) fail('P1 PDF closure is incomplete')
if (!graph.productIntegration?.workspaceHomeVisible || !graph.productIntegration?.centeredGraphNavigation || !crossFormatGraph.qualityGate?.representativeCrossFormatPulseComplete) fail('P1 knowledge graph presence is incomplete')
if (!closure.patchReleaseGate || closure.patchReleaseGate.newCapabilityWorkRequired !== false || !Object.entries(closure.patchReleaseGate).filter(([key]) => key !== 'newCapabilityWorkRequired').every(([, value]) => value === true)) fail('P1 patch release gate is incomplete')
if (!packageJson.scripts?.['check:p1-final-capability-closure'] || !read('scripts/check-current-development-audit.mjs').includes("check-p1-final-capability-closure.mjs")) fail('P1 final checker is not reachable from the current audit')
for (const section of ['## 1. 总结论', '## 2. 最初需求逐项对齐', '## 3. 格式能力分层', '## 4. 知识图谱与思维导图结论', '## 5. 发布边界', '## 6. 下一阶段执行顺序']) if (!audit.includes(section)) fail(`P1 final audit section missing: ${section}`)
for (const [label, source, markers] of [['plan', plan, ['P1 总收口已完成', '1.0.11']], ['handoff', handoff, ['P1 总收口', 'p1-final-capability-closure.json']]]) for (const marker of markers) if (!source.includes(marker)) fail(`${label} marker missing: ${marker}`)

console.log(`P1 final capability closure passed: ${registry.formats.length} formats/${extensionCount} extensions are tiered truthfully; bounded daily management and basic editing are ready for the v1.0.11 unsigned patch release flow.`)
