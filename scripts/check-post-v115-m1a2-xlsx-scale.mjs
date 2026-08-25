import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1a2-xlsx-scale-policy.json', 'utf8'))
const evidence = JSON.parse(fs.readFileSync('docs/evidence/post-v115-m1a2-xlsx-scale/scale-evidence.json', 'utf8'))
const failures = []
if (policy.stage !== 'M1A2' || evidence.stage !== 'M1A2') failures.push('M1A2 identity mismatch')
if (policy.tiers.map(item => item.cells).join(',') !== '10000,50000,100000') failures.push('M1A2 scale tiers drift')
if (!evidence.differenceResolved || evidence.afterActual.runtimeErrorCount !== 0 || evidence.afterActual.blockingErrorSurfaceObserved) failures.push('M1A2 desktop evidence was not accepted')
for (const tier of policy.tiers) {
  const actual = evidence.afterActual.tiers.find(item => item.cells === tier.cells)
  if (!actual || actual.openMs > tier.maximumOpenMs || actual.bottomPageMs > tier.maximumBottomPageMs || actual.saveMs > tier.maximumSaveMs || !actual.sourceUnchangedBeforeSave || !actual.targetChangedAfterSave) failures.push(`M1A2 tier failed: ${tier.cells}`)
}
for (const file of [policy.objectAudit.fixture, 'src-tauri/src/bin/xlsx-m1a2-fixture.rs', 'scripts/capture-post-v115-m1a2-xlsx-scale.mjs']) if (!fs.existsSync(file)) failures.push(`M1A2 file missing: ${file}`)
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log(`M1A2 scale accepted: ${evidence.afterActual.tiers.map(item => `${item.cells}=${item.openMs}/${item.bottomPageMs}/${item.saveMs}ms`).join(', ')}`)
