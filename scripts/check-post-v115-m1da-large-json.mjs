import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = readJson('shared/post-v115-m1da-large-json-policy.json')
const evidence = readJson('docs/evidence/post-v115-m1da-large-json/runtime-evidence.json')
const view = fs.readFileSync('src/views/JsonEditorView.vue', 'utf8')

const checks = {
  acceptedPolicy: policy.status === 'accepted'
    && policy.largeJsonThresholdBytes === 4 * 1024 * 1024
    && policy.displayRangeBytes === 512 * 1024
    && policy.searchRangeBytes === 1024 * 1024
    && policy.largeJsonSourceWriteEnabled === false,
  progressiveImplementation: view.includes('LARGE_JSON_RANGE_THRESHOLD_BYTES = 4 * 1024 * 1024')
    && view.includes('JSON_RANGE_BYTES = 512 * 1024')
    && view.includes('JSON_SEARCH_RANGE_BYTES = 1024 * 1024')
    && view.includes('read_external_text_document_range')
    && view.includes('大文件渐进只读')
    && view.includes('搜索整个文件'),
  evidencePassed: evidence.stage === policy.stage && evidence.status === 'passed' && evidence.passed === true,
  tenMiB: evidence.actual.json10.openMs < evidence.expected.firstRangeVisibleWithinMs
    && evidence.actual.json10.search.progress === '100%'
    && evidence.actual.json10.search.count >= 1
    && evidence.actual.json10.first.treeDisabled === true
    && evidence.actual.json10.first.saveDisabled === true,
  fiftyMiB: evidence.actual.json50.openMs < evidence.expected.firstRangeVisibleWithinMs
    && evidence.actual.json50.search.progress === '100%'
    && evidence.actual.json50.search.count >= 1
    && evidence.actual.json50.first.treeDisabled === true
    && evidence.actual.json50.first.saveDisabled === true,
  bidirectionalNavigation: evidence.actual.json10.nextLabel !== evidence.actual.json10.first.rangeLabel
    && evidence.actual.json10.previousLabel === evidence.actual.json10.first.rangeLabel
    && evidence.actual.json50.nextLabel !== evidence.actual.json50.first.rangeLabel
    && evidence.actual.json50.previousLabel === evidence.actual.json50.first.rangeLabel,
  smallJsonPreserved: evidence.actual.small.rangeMode === false
    && evidence.actual.small.analysisStatus === '语法有效'
    && evidence.actual.small.treeDisabled === false
    && evidence.actual.small.treeRows > 0,
  safetyAndLayout: evidence.actual.sourceUnchanged === true
    && evidence.actual.runtimeErrorCount === 0
    && evidence.actual.json10.first.pageOverflow <= 0
    && evidence.actual.json50.first.pageOverflow <= 0
    && evidence.actual.json10.narrow.pageOverflow <= 0
    && evidence.actual.json50.narrow.pageOverflow <= 0,
}

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
if (failures.length) throw new Error(`M1D-A large JSON gate failed: ${failures.join(', ')}`)
console.log('M1D-A large JSON accepted: progressive read, segment navigation, streaming search and small-file editing are real-desktop verified.')
