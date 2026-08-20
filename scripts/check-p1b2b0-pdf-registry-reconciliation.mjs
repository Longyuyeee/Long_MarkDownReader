import fs from 'node:fs'

const registry = JSON.parse(fs.readFileSync('shared/file-formats.json', 'utf8'))
const release = JSON.parse(fs.readFileSync('shared/release-capability-matrix.json', 'utf8'))
const degradation = JSON.parse(fs.readFileSync('shared/safe-degradation-contract.json', 'utf8'))
const contract = JSON.parse(fs.readFileSync('shared/pdf-advanced-editing-contract.json', 'utf8'))
const fail = message => { console.error(message); process.exit(1) }

const pdf = registry.formats.find(item => item.id === 'pdf')
if (!pdf || pdf.capabilities?.edit !== 'supported' || pdf.capabilities?.create !== 'unsupported'
  || pdf.userCapability?.level !== 'basic-edit' || pdf.userCapability?.saveMode !== 'copy'
  || pdf.adapters?.writer !== 'pdf-copy' || pdf.externalPolicy !== 'preview') {
  fail('P1-B2B0 PDF registry boundary is not reconciled')
}
const mapping = release.formats.find(item => item.id === 'pdf')
const profile = release.profiles.find(item => item.id === 'pdf-copy')
const limitations = profile?.knownLimitations?.join(' ') || ''
const hasHistoricalFormBoundary = limitations.includes('填写副本尚未开放')
const hasCurrentBoundedFormBoundary = ['单行文本', '复选框', '单选组', '单选 Choice']
  .every(token => limitations.includes(token))
if (mapping?.profile !== 'pdf-copy' || mapping.readiness !== 'verified-with-limitations' || !profile
  || !profile.sourcePolicy.includes('永不覆盖') || (!hasHistoricalFormBoundary && !hasCurrentBoundedFormBoundary)) {
  fail('P1-B2B0 release capability boundary is incomplete')
}
const lane = degradation.lanes.find(item => item.id === 'pdf-reliable-copy-isolation')
if (!lane || lane.formats?.join(',') !== 'pdf' || lane.saveModes?.join(',') !== 'copy'
  || lane.profiles?.join(',') !== 'pdf-copy' || lane.sourcePolicy !== 'never-overwrite-source-sidecars-and-new-copies-only') {
  fail('P1-B2B0 safe-degradation lane is incomplete')
}
if (contract.registryFinding?.status !== 'reconciled-before-b2b' || contract.registryFinding?.writer !== 'pdf-copy') {
  fail('P1-B2B0 advanced editing contract is not reconciled')
}

console.log(`P1-B2B0 PDF registry reconciliation passed: library-only copy boundaries remain intact and the public form state is ${hasCurrentBoundedFormBoundary ? 'advanced-but-bounded' : 'historical-read-only'}.`)
