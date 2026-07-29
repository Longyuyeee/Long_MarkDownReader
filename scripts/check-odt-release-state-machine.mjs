import fs from 'node:fs'
import path from 'node:path'
import {
  ODT_PREVIEW_FORMAT,
  validateOdtReleaseState,
} from './odt-release-state-machine.mjs'

const root = process.cwd()
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const clone = value => structuredClone(value)
const current = {
  contract: readJson('shared/odt-read-contract.json'),
  matrix: readJson('fixtures/odt/producers/matrix.json'),
  registry: readJson('shared/file-formats.json'),
  desktopManifest: readJson('docs/evidence/e1b-odt-desktop/audit-manifest.json'),
}
const assertValid = (name, state) => {
  const failures = validateOdtReleaseState(state)
  if (failures.length) throw new Error(`${name} should pass:\n${failures.join('\n')}`)
}
const assertInvalid = (name, state, expected) => {
  const failures = validateOdtReleaseState(state)
  if (!failures.some(failure => failure.includes(expected))) {
    throw new Error(`${name} should fail with "${expected}":\n${failures.join('\n')}`)
  }
}

assertValid('current checkpoint', current)

const released = clone(current)
released.contract.releaseState = 'released-preview'
released.contract.complete = true
released.contract.releaseGatePassed = true
released.contract.nextStage = 'E1C'
released.contract.productExposure.registeredAsSupported = true
released.contract.producerGate.verified = [
  'microsoft-word-16',
  'wps-writer',
  'libreoffice-writer',
]
released.contract.producerGate.blocked = {}
released.contract.producerGate.blockerEvidence = {}
released.contract.desktopEvidence.producers = released.contract.producerGate.verified
released.matrix.producers[1] = {
  id: 'wps-writer',
  producer: 'WPS Writer',
  status: 'verified',
  manifest: 'wps-writer.json',
  fixture: 'wps-writer.odt',
  blockerEvidence: null,
  blocker: null,
}
released.registry.formats.push(clone(ODT_PREVIEW_FORMAT))
released.desktopManifest.gateMode = 'closure-candidate'
released.desktopManifest.producerMatrix = released.contract.producerGate.verified
assertValid('future released preview', released)

const earlyRegistration = clone(current)
earlyRegistration.registry.formats.push(clone(ODT_PREVIEW_FORMAT))
assertInvalid('early registration', earlyRegistration, 'checkpoint must not register .odt')

const writableRelease = clone(released)
writableRelease.registry.formats.at(-1).capabilities.edit = 'supported'
writableRelease.registry.formats.at(-1).adapters.writer = 'odt'
assertInvalid('writable release', writableRelease, 'exact preview-only contract')

const partialRelease = clone(released)
partialRelease.contract.producerGate.verified = ['microsoft-word-16', 'libreoffice-writer']
assertInvalid('partial release', partialRelease, 'producer gate and fixture matrix are not atomic')

console.log('E1B ODT release state machine passed: checkpoint, atomic 3/3 preview release, and partial-state rejection.')
