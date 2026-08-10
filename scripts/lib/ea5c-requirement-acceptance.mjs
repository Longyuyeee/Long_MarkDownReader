import fs from 'node:fs'

const closure = JSON.parse(fs.readFileSync('shared/ea5c-external-open-closure.json', 'utf8'))
const installed = JSON.parse(fs.readFileSync('docs/evidence/ea-5b2-installed-default-app/audit-manifest.json', 'utf8'))

export const hasEa5cRequirementAcceptance = (id, audit) => {
  const requirement = closure.experienceClosure?.foundationalEvidence?.find(item => item.id === id)
  const rowAccepted = new RegExp(`\\| ${id} \\|[^\\n]+\\| 已(?:完成|验收)(?:（[^）]+）)? \\|`).test(audit)
  const referencesExist = requirement?.references?.length > 0
    && requirement.references.every(reference => fs.existsSync(reference))
  const installedAccepted = installed.stage === 'EA-5B2B'
    && installed.checks?.lifecycle?.failed === 0
    && installed.checks?.installedArtifactSmoke?.failed === 0
    && installed.checks?.sourceUserContentIncluded === false

  return closure.stage === 'EA-5C'
    && closure.status === 'accepted-bounded'
    && closure.releaseCandidate === false
    && rowAccepted
    && referencesExist
    && installedAccepted
}
