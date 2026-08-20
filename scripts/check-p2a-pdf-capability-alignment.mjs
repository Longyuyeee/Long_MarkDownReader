import fs from 'node:fs'

const registry = JSON.parse(fs.readFileSync('shared/file-formats.json', 'utf8'))
const matrix = JSON.parse(fs.readFileSync('shared/release-capability-matrix.json', 'utf8'))
const pdf = registry.formats.find(format => format.id === 'pdf')
const profile = matrix.profiles.find(item => item.id === 'pdf-copy')
const failures = []

if (!pdf || !profile) failures.push('PDF registry entry and pdf-copy profile must exist')

const publicFacts = `${pdf?.userCapability?.description || ''} ${profile?.sourcePolicy || ''} ${(profile?.knownLimitations || []).join(' ')}`
for (const fact of ['表单', '永久脱敏', '水印', '文档属性']) {
  if (!publicFacts.includes(fact)) failures.push(`public PDF capability is missing ${fact}`)
}

for (const boundary of ['单行文本', '复选框', '单选组', '单选 Choice', '图片型副本']) {
  if (!publicFacts.includes(boundary)) failures.push(`public PDF boundary is missing ${boundary}`)
}

for (const staleClaim of ['表单目前只读检查', '填写副本尚未开放']) {
  if (publicFacts.includes(staleClaim)) failures.push(`stale PDF claim remains: ${staleClaim}`)
}

if (pdf?.userCapability?.saveMode !== 'copy' || pdf?.adapters?.writer !== 'pdf-copy') {
  failures.push('PDF must remain copy-only through pdf-copy')
}
if (profile?.sourcePolicy && !profile.sourcePolicy.includes('永不覆盖')) {
  failures.push('PDF source preservation boundary must remain explicit')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log('P2-A PDF capability alignment passed: implemented copy workflows and bounded limitations are public and source overwrite remains forbidden.')
