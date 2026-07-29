export const ODT_PRODUCER_IDS = [
  'microsoft-word-16',
  'wps-writer',
  'libreoffice-writer',
]

export const ODT_PREVIEW_FORMAT = {
  id: 'odt',
  label: 'OpenDocument 文本文档',
  extensions: ['.odt'],
  mimeTypes: ['application/vnd.oasis.opendocument.text'],
  routeName: 'OdtReader',
  maxBytes: 64 * 1024 * 1024,
  capabilities: {
    read: 'supported',
    edit: 'unsupported',
    create: 'unsupported',
    index: 'supported',
  },
  userCapability: {
    level: 'preview-only',
    label: '只读预览',
    saveMode: 'none',
    description: 'ODT 支持受信任包的结构化只读预览、搜索、定位和全文索引；不修改或覆盖原文件。',
  },
  externalPolicy: 'import',
  adapters: {
    reader: 'odt',
    writer: null,
    creator: null,
    indexer: 'odt',
  },
  creation: null,
}

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)

export function validateOdtReleaseState({ contract, matrix, registry, desktopManifest }) {
  const failures = []
  const fail = message => failures.push(message)
  const releaseState = contract.releaseState
  const odtFormats = (registry.formats || []).filter(format =>
    format.id === 'odt' || format.extensions?.includes('.odt'))
  const matrixIds = (matrix.producers || []).map(producer => producer.id)
  const verifiedIds = ODT_PRODUCER_IDS.filter(id =>
    matrix.producers?.find(producer => producer.id === id)?.status === 'verified')
  const blockedIds = ODT_PRODUCER_IDS.filter(id =>
    matrix.producers?.find(producer => producer.id === id)?.status === 'blocked')

  if (!['checkpoint', 'released-preview'].includes(releaseState)) fail('invalid release state')
  if (!contract.implementationComplete) fail('implementation must remain complete')
  if (!same(contract.releaseTransition, {
    from: 'checkpoint',
    to: 'released-preview',
    requirements: [
      'three-producer-fixtures-verified',
      'closure-candidate-desktop-evidence-passed',
      'preview-only-registry-entry-exact',
      'write-capability-disabled',
    ],
    nextStage: 'E1C',
  })) fail('release transition contract drift')
  if (contract.productExposure?.writeEnabled !== false) fail('ODT write capability must remain disabled')
  for (const field of ['commandImplemented', 'uiImplemented', 'indexImplemented']) {
    if (contract.productExposure?.[field] !== true) fail(`${field} evidence missing`)
  }
  if (!same(matrix.requiredProducerIds, ODT_PRODUCER_IDS)
    || !same(matrixIds, ODT_PRODUCER_IDS)) fail('producer inventory drift')
  if (!same(contract.producerGate?.required, ODT_PRODUCER_IDS)
    || !same(contract.producerGate?.verified, verifiedIds)
    || !same(Object.keys(contract.producerGate?.blocked || {}), blockedIds)
    || !same(Object.keys(contract.producerGate?.blockerEvidence || {}), blockedIds)) {
    fail('producer gate and fixture matrix are not atomic')
  }
  if (!same(contract.desktopEvidence?.producers, verifiedIds)
    || !same(desktopManifest.producerMatrix, verifiedIds)) {
    fail('desktop evidence and producer gate are not atomic')
  }
  for (const producer of matrix.producers || []) {
    if (producer.status === 'verified' && (!producer.fixture || !producer.manifest
      || producer.blocker || producer.blockerEvidence)) {
      fail(`verified producer metadata is incomplete: ${producer.id}`)
    }
    if (producer.status === 'blocked' && (producer.fixture || producer.manifest
      || !producer.blocker || !producer.blockerEvidence)) {
      fail(`blocked producer metadata is incomplete: ${producer.id}`)
    }
  }

  if (releaseState === 'checkpoint') {
    if (contract.complete || contract.releaseGatePassed
      || contract.nextStage !== 'E1B-producer-gate-closure') fail('checkpoint lifecycle drift')
    if (contract.productExposure?.registeredAsSupported !== false || odtFormats.length !== 0) {
      fail('checkpoint must not register .odt')
    }
    if (!same(verifiedIds, ['microsoft-word-16', 'libreoffice-writer'])
      || !same(blockedIds, ['wps-writer'])) fail('checkpoint producer state drift')
    if (desktopManifest.gateMode !== 'checkpoint') fail('checkpoint desktop evidence mode drift')
  }

  if (releaseState === 'released-preview') {
    if (!contract.complete || !contract.releaseGatePassed || contract.nextStage !== 'E1C') {
      fail('released preview lifecycle drift')
    }
    if (contract.productExposure?.registeredAsSupported !== true
      || odtFormats.length !== 1
      || !same(odtFormats[0], ODT_PREVIEW_FORMAT)) {
      fail('released .odt registry entry must match the exact preview-only contract')
    }
    if (!same(verifiedIds, ODT_PRODUCER_IDS) || blockedIds.length !== 0) {
      fail('released preview requires all three producers')
    }
    if (desktopManifest.gateMode !== 'closure-candidate') {
      fail('released preview requires closure-candidate desktop evidence')
    }
  }

  return failures
}
