import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const matrixPath = path.join(root, 'shared/office-compatibility-audit.json')
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'))
const fail = message => { throw new Error(`E0 Office compatibility audit: ${message}`) }
const expectedExtensions = ['.odt', '.ods', '.odp', '.wps', '.et', '.dps', '.doc', '.xls', '.ppt']

if (matrix.schemaVersion !== 1 || matrix.stage !== 'E0' || matrix.complete !== true) fail('invalid stage header')
if (matrix.targetExtensions?.join(',') !== expectedExtensions.join(',')) fail('target extension order or coverage drift')
if (matrix.formats?.length !== expectedExtensions.length) fail('all nine target formats must have decisions')
if (new Set(matrix.formats.map(format => format.extension)).size !== expectedExtensions.length) fail('format decisions must have unique extensions')

for (const extension of expectedExtensions) {
  const format = matrix.formats.find(candidate => candidate.extension === extension)
  if (!format) fail(`missing format decision for ${extension}`)
  for (const field of ['family', 'container', 'specification', 'e0Disposition', 'firstImplementation', 'initialProductLevel', 'conversion']) {
    if (!format[field]) fail(`${extension} is missing ${field}`)
  }
  if (!Array.isArray(format.risks) || format.risks.length < 4) fail(`${extension} has an incomplete risk inventory`)
  if (!Array.isArray(format.fixtureProfiles) || format.fixtureProfiles.length < 5) fail(`${extension} has an incomplete fixture plan`)
}

for (const extension of ['.odt', '.ods', '.odp']) {
  const format = matrix.formats.find(candidate => candidate.extension === extension)
  if (format.container !== 'zip-xml' || !format.rootMime || format.initialProductLevel !== 'read-only-preview-and-index') {
    fail(`${extension} must remain on the native read-only ODF path`)
  }
}

for (const extension of ['.wps', '.et', '.dps']) {
  const format = matrix.formats.find(candidate => candidate.extension === extension)
  if (format.initialProductLevel !== 'external-open' || format.conversion !== 'blocked-until-real-fixture-qualification') {
    fail(`${extension} must remain blocked from conversion until real fixtures qualify it`)
  }
}

for (const extension of ['.doc', '.xls', '.ppt']) {
  const format = matrix.formats.find(candidate => candidate.extension === extension)
  if (format.container !== 'ole-compound-binary' || format.conversion !== 'explicit-new-copy-after-preflight') {
    fail(`${extension} must remain on the isolated explicit-conversion path`)
  }
}

const policy = matrix.sourcePolicy || {}
for (const field of ['requireExplicitUserAction', 'requireSourceDigestUnchanged', 'requireOutputStructuralReopen']) {
  if (policy[field] !== true) fail(`source policy ${field} must remain enabled`)
}
for (const field of ['automaticConversion', 'overwriteSource', 'overwriteExistingTarget', 'executeEmbeddedContent', 'followExternalRelationships']) {
  if (policy[field] !== false) fail(`source policy ${field} must remain disabled`)
}

if (!matrix.converterCandidates?.some(candidate => candidate.id === 'native-odf-reader' && candidate.disposition === 'selected')) {
  fail('native ODF read path decision is missing')
}
if (!matrix.converterCandidates?.some(candidate => candidate.id === 'libreoffice-external' && candidate.disposition === 'qualified-for-pilot')) {
  fail('optional LibreOffice pilot decision is missing')
}
if (!matrix.converterCandidates?.some(candidate => candidate.id === 'wps-private-cli' && candidate.disposition === 'blocked-undocumented-contract')) {
  fail('WPS private CLI boundary is missing')
}
if (!Array.isArray(matrix.sources) || matrix.sources.length < 8 || matrix.sources.some(source => !source.startsWith('https://'))) {
  fail('official source inventory is incomplete')
}
if (matrix.implementationOrder?.[0] !== 'E1A-odf-package-verifier' || matrix.implementationOrder.at(-1) !== 'R-unified-release-matrix') {
  fail('implementation order drift')
}

console.log('E0 Office compatibility audit OK: 9/9 decisions, source-preserving policy locked, next E1A')
