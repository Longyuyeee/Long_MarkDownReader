import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = readJson('shared/post-v115-m1dc-selection-policy.json')
const evidence = readJson('docs/evidence/post-v115-m1dc-selection/runtime-evidence.json')
const media = fs.readFileSync('src/views/MediaViewerView.vue', 'utf8')
const yaml = fs.readFileSync('src/views/YamlEditorView.vue', 'utf8')
const xml = fs.readFileSync('src/views/XmlEditorView.vue', 'utf8')
const toml = fs.readFileSync('src/views/TomlEditorView.vue', 'utf8')

const checks = {
  acceptedSelection: policy.status === 'accepted-selection'
    && policy.selectedNextStage === 'M1D-C1-external-subtitle-sidecar-playback'
    && policy.releaseCandidate === false,
  evidencePassed: evidence.stage === policy.stage
    && evidence.status === 'passed-selection-baseline'
    && evidence.passed === true,
  realSubtitleGap: evidence.actual.sidecars.vttValid
    && evidence.actual.sidecars.srtValid
    && evidence.actual.sidecars.vttCueCount === 2
    && evidence.actual.sidecars.srtCueCount === 2
    && evidence.actual.subtitle.decoded
    && evidence.actual.subtitle.textTrackCount === 0
    && evidence.actual.subtitle.subtitleControlVisible === false,
  realStructuredGap: ['yaml', 'xml', 'toml'].every(id => evidence.actual.structured[id].valid
    && evidence.actual.structured[id].diagnosticCount === 0)
    && evidence.actual.yamlUi.syntaxValidVisible
    && evidence.actual.yamlUi.schemaControlVisible === false,
  currentImplementationFacts: !media.includes('<track')
    && !media.includes('textTracks')
    && !yaml.includes('schemaUrl')
    && !xml.includes('schemaUrl')
    && !toml.includes('schemaUrl'),
  safetyAndLayout: evidence.actual.sourceUnchanged
    && evidence.actual.runtimeErrorCount === 0
    && evidence.actual.subtitle.pageOverflow <= 0
    && evidence.actual.yamlUi.pageOverflow <= 0,
  scopeBounded: policy.deferredScope.includes('embedded-subtitle-demux')
    && policy.deferredScope.includes('video-transcoding')
    && policy.deferredScope.includes('structured-schema-provider-and-mapping'),
}

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
if (failures.length) throw new Error(`M1D-C selection gate failed: ${failures.join(', ')}`)
console.log('M1D-C selection accepted: real sidecars and semantic-invalid structured files select bounded external subtitle playback as M1D-C1.')
