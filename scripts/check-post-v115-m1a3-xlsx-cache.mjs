import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1a3-xlsx-cache-policy.json', 'utf8'))
const evidence = JSON.parse(fs.readFileSync('docs/evidence/post-v115-m1a3-xlsx-cache/cache-evidence.json', 'utf8'))
const source = fs.readFileSync('src-tauri/src/commands/workbook.rs', 'utf8')
const failures = []
if (policy.stage !== 'M1A3' || evidence.stage !== 'M1A3') failures.push('M1A3 identity mismatch')
if (!evidence.differenceResolved || evidence.afterActual.runtimeErrorCount !== 0 || evidence.afterActual.blockingErrorSurfaceObserved) failures.push('M1A3 desktop evidence was not accepted')
for (const tier of policy.tiers) {
  const actual = evidence.afterActual.tiers.find(item => item.cells === tier.cells)
  if (!actual || actual.openMs > tier.maximumOpenMs || actual.bottomPageMs > tier.maximumBottomPageMs) failures.push(`M1A3 tier failed: ${tier.cells}`)
}
const largest = evidence.afterActual.tiers.at(-1)
if (!largest || largest.improvementRatio < policy.expected.largestTierMinimumImprovementRatio) failures.push('M1A3 100k improvement is below policy')
for (const marker of ['WorksheetValueCache', 'WORKSHEET_VALUE_CACHE', 'workbook_signature(&metadata, &source)', policy.cacheBoundary.realInvalidationTest]) if (!source.includes(marker)) failures.push(`M1A3 implementation marker missing: ${marker}`)
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`M1A3 cache accepted: ${evidence.afterActual.tiers.map(item => `${item.cells}=${item.openMs}/${item.bottomPageMs}ms`).join(', ')}`)
