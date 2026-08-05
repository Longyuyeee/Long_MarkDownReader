import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const fail = message => { console.error(`UX-38 final closure rejected: ${message}`); process.exit(1) }
const registry = readJson('shared/file-formats.json')
const matrix = readJson('shared/ux38-format-experience-matrix.json')
const closure = readJson('shared/ux38-final-closure.json')
const packageJson = readJson('package.json')
const dimensions = ['open', 'load', 'states', 'edit', 'save', 'return', 'tab', 'theme', 'scale', 'keyboard', 'performance', 'errors']
const formats = matrix.formats || []
const usedProfiles = new Set(formats.map(format => format.profile))
const profileIds = Object.keys(matrix.profiles || {})
if (matrix.status !== 'accepted-bounded' || matrix.releaseCandidate !== false) fail('matrix closure or release boundary drift')
if (formats.length !== registry.formats.length || formats.length !== closure.formatCount || formats.length !== 41) fail('format coverage drift')
if (dimensions.length !== closure.dimensionCount || JSON.stringify(matrix.dimensions) !== JSON.stringify(dimensions)) fail('dimension coverage drift')
if (usedProfiles.size !== profileIds.length || usedProfiles.size !== closure.profileCount || profileIds.some(profile => !usedProfiles.has(profile))) fail('unused or missing experience profile')
const counts = { accepted: 0, partial: 0, referenced: 0, 'not-applicable': 0, pending: 0 }
for (const [profileId, profile] of Object.entries(matrix.profiles)) {
  if (typeof profile.boundary !== 'string' || profile.boundary.length < 20) fail(`${profileId} has no explicit capability boundary`)
  for (const evidence of profile.evidence || []) if (!fs.existsSync(evidence)) fail(`${profileId} evidence path is missing: ${evidence}`)
  for (const dimension of dimensions) {
    const status = profile.dimensions?.[dimension]
    if (!(status in counts)) fail(`${profileId}.${dimension} has an invalid status`)
    counts[status] += 1
  }
}
if (counts.pending !== 0 || closure.unusedProfileCount !== 0) fail('pending or unused profile remains')
for (const [status, count] of Object.entries(closure.dimensionStatusCounts)) if (counts[status] !== count) fail(`${status} dimension count drift: ${counts[status]} != ${count}`)
if (closure.status !== matrix.status || closure.productBaselineCommit !== '84ceaf8d0e44dd7af387944fe4f38753dfef16b2' || closure.evidenceBaselineCommit !== 'e783abc' || closure.releaseCandidate !== false) fail('closure identity drift')
if (!packageJson.scripts?.['check:ux38-final-closure'] || !packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38-final-closure')) fail('final checker is outside the development audit chain')
console.log(`UX-38 final closure passed: ${formats.length} formats, ${usedProfiles.size} bounded profiles, ${counts.accepted} accepted dimensions, and no pending entries.`)
