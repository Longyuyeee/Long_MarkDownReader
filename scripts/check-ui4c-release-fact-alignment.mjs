import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const failures = []

const pkg = json('package.json')
const tauri = json('src-tauri/tauri.conf.json')
const matrix = json('shared/release-capability-matrix.json')
const community = json('shared/v1-community-release-policy.json')
const config = read('src/config/releaseCapabilities.ts')
const view = read('src/views/ReleaseCapabilitiesView.vue')
const auditPath = `docs/V${community.appVersion.replaceAll('.', '_')}_Unsigned_Community_Release_Audit_${community.generatedAt}.md`
const audit = fs.existsSync(auditPath) ? read(auditPath) : ''
const tag = `v${pkg.version}`
const compareVersions = (left, right) => {
  const parse = value => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
    if (!match) throw new Error(`invalid version ${value}`)
    return match.slice(1).map(Number)
  }
  const leftParts = parse(left)
  const rightParts = parse(right)
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index]
  }
  return 0
}

if (pkg.version !== tauri.version || pkg.version !== matrix.appVersion || compareVersions(community.appVersion, pkg.version) > 0) failures.push('public version identity drift')
if (matrix.stage !== 'R2' || matrix.releaseCandidate !== false) failures.push('capability or enterprise RC boundary drift')
if (community.channel !== 'community-unsigned') failures.push('community release channel drift')

const published = community.gates?.githubReleasePublished === true
const publishedCurrent = published && community.appVersion === pkg.version
const publishedPrior = published && compareVersions(community.appVersion, pkg.version) < 0
const ready = !published && community.gates?.qualityGatePassed === true
const pending = !published && !ready
if (published && (community.currentStatus !== `v${community.appVersion}-community-release-published` || community.release?.tag !== `v${community.appVersion}`)) failures.push('published community receipt drift')
if (publishedPrior && !config.includes('发布准备中 · 当前公开')) failures.push('pre-release public status is missing')
if (ready && (community.currentStatus !== `${tag}-community-release-ready-to-publish` || community.releaseCandidate !== true)) failures.push('ready community state drift')
if (pending && (community.currentStatus !== `${tag}-community-release-quality-gate-pending` || community.releaseCandidate !== false)) failures.push('pending community state drift')

for (const token of ['communityReleaseSource', 'RELEASE_PUBLIC_STATUS_LABEL', '社区版已发布', '社区版']) {
  if (!config.includes(token)) failures.push(`release capability config is missing ${token}`)
}
if (!view.includes('{{ RELEASE_PUBLIC_STATUS_LABEL }}')) failures.push('release capability page does not use the public status label')

for (const token of ['community-unsigned', 'releaseCandidate=false', '手动下载安装']) {
  if (!audit.includes(token)) failures.push(`release audit is missing ${token}`)
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log(`UI-4C release facts passed: ${tag} is ${publishedCurrent ? 'published' : publishedPrior ? `being prepared above v${community.appVersion}` : ready ? 'ready' : 'being prepared'} and enterprise RC remains separate.`)
