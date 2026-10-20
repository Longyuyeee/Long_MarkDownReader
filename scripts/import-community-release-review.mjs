import {crossCopyChecks,assertCrossCopyOutputBytes} from './lib/installed-v1-1-21-evidence.mjs'
import {fileHistoryChecks,assertFileHistoryOutputBytes} from './lib/installed-v1-1-22-evidence.mjs'
import {attachmentChecks,assertAttachmentOutputBytes} from './lib/installed-v1-1-23-evidence.mjs'
import {chapterChecks,assertChapterOutputBytes} from './lib/installed-v1-1-24-evidence.mjs'
import {structuredChecks,assertStructuredOutputBytes} from './lib/installed-v1-1-20-evidence.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { assertInstalledReleaseRuntime } from './lib/installed-release-runtime.mjs'
import { saveHistoryChecks } from './lib/installed-v1-1-7-workflow.mjs'
import { searchCompletenessChecks } from './lib/installed-v1-1-8-evidence.mjs'
import { workSessionChecks } from './lib/installed-v1-1-9-evidence.mjs'
import { tagCollectionChecks } from './lib/installed-v1-1-10-evidence.mjs'
import { graphExplorationChecks } from './lib/installed-v1-1-11-evidence.mjs'
import { contentBackupChecks } from './lib/installed-v1-1-12-evidence.mjs'
import { pdfReadingChecks } from './lib/installed-v1-1-13-evidence.mjs'
import { tableEditingChecks } from './lib/installed-v1-1-15-evidence.mjs'
import { workbookEditingChecks } from './lib/installed-v1-1-16-evidence.mjs'
import { writingDeliveryChecks } from './lib/installed-v1-1-14-evidence.mjs'
import { docxEditingChecks, assertDocxOutputBytes } from './lib/installed-v1-1-17-evidence.mjs'
import { pptxEditingChecks, assertPptxOutputBytes } from './lib/installed-v1-1-18-evidence.mjs'

import { organizingChecks, assertOrganizingOutputBytes } from './lib/installed-v1-1-19-evidence.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value, all[index + 1]]], []))
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
const directory = args['--review-dir'], buildRun = Number(args['--build-run']), reviewRun = Number(args['--review-run'])
assert.ok(directory && Number.isSafeInteger(buildRun) && buildRun > 0 && Number.isSafeInteger(reviewRun) && reviewRun > 0, 'Provide immutable build/review run IDs and the downloaded review directory')
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const receipt = json(path.join(directory, 'installer-build-receipt.json'))
assert.equal(receipt.appVersion, version)
assert.equal(receipt.sourceUserContentIncluded, false)
assert.match(receipt.candidateSourceCommit, /^[a-f0-9]{40}$/)
assert.equal(receipt.artifacts.length, 2)
const reports = Object.fromEntries([
  ...(version==='1.1.24' ? [['chapters','installed-v1124-workflow.json',chapterChecks.length]] : []),
  ...(['1.1.23','1.1.24'].includes(version) ? [['attachments','installed-v1123-workflow.json',attachmentChecks.length]] : []),
  ...(['1.1.22','1.1.23', '1.1.24'].includes(version) ? [['fileOperationHistory','installed-v1122-workflow.json',fileHistoryChecks.length]] : []),
  ...(['1.1.21','1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['crossLibraryCopy','installed-v1121-workflow.json',crossCopyChecks.length]] : []),
  ...(['1.1.20','1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['structuredEditing','installed-v1120-workflow.json',structuredChecks.length]] : []),
  ...(['1.1.19','1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['organizing','installed-v1119-workflow.json',organizingChecks.length]] : []),
  ...(['1.1.18','1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['pptxEditing','installed-v1118-workflow.json',pptxEditingChecks.length]] : []),
  ...(['1.1.17','1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['docxEditing','installed-v1117-workflow.json',docxEditingChecks.length]] : []),
  ...(['1.1.16','1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['workbookEditing','installed-v1116-workflow.json',workbookEditingChecks.length]] : []),
  ...(['1.1.15','1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['tableEditing','installed-v1115-workflow.json',tableEditingChecks.length]] : []),
  ...(['1.1.14','1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['writingDelivery','installed-v1114-workflow.json',writingDeliveryChecks.length]] : []),
  ...(['1.1.13','1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['pdfReading','installed-v1113-workflow.json',pdfReadingChecks.length]] : []),
  ...(['1.1.12','1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['contentBackup','installed-v1112-workflow.json',contentBackupChecks.length]] : []),
  ...(['1.1.11','1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['graphExploration','installed-v1111-workflow.json',graphExplorationChecks.length]] : []),
  ...(['1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['tagCollections','installed-v1110-workflow.json',tagCollectionChecks.length]] : []),
  ...(['1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['workSession','installed-v119-workflow.json',workSessionChecks.length]] : []),
  ['lifecycle', 'lifecycle-result.json', 22], ['management', 'management-backup-index-evidence.json', 7],
  ['workspace', 'installed-artifact-smoke.json', 18], ['version', 'installed-version-identity.json', 4],
  ['workflow', 'installed-v110-workflow.json', 8], ['experience', 'installed-v111-workflow.json', 8],
  ['fileManagement', 'installed-v112-workflow.json', 9], ['foundation', 'installed-v113-workflow.json', 8],
...(['1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['foundationExtended', 'installed-v114-workflow.json', 8]] : []),
...(['1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['foundationHardening', 'installed-v115-workflow.json', 11]] : []),
...(['1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['moveContinuity', 'installed-v116-workflow.json', 13]] : []),
...(['1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['saveHistory','installed-v117-workflow.json',saveHistoryChecks.length]] : []),
...(['1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['searchCompleteness', 'installed-v118-workflow.json', searchCompletenessChecks.length]] : []),
].map(([key, file, count]) => {
  const report = json(path.join(directory, file))
  assert.equal(report.status, 'passed', file); assert.equal(report.sourceUserContentIncluded, false, file)
  assert.equal(report.checks.length, count, file); assert.ok(report.checks.every(check => check.status === 'passed'), file)
  if (report.appVersion) assert.equal(report.appVersion, version, file)
  if (report.sourceCommit) assert.equal(report.sourceCommit, receipt.candidateSourceCommit, file)
  return [key, { file, report }]
}))
assert.equal(reports.lifecycle.report.currentVersion, version)
assert.equal(reports.lifecycle.report.previousVersion, receipt.previousVersion)
if(['1.1.15','1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version)) for(const [field,file] of [['csvInspection','installed-v1115-saved.csv'],['xlsxInspection','installed-v1115-export.xlsx']]) assert.equal(digest(fs.readFileSync(path.join(directory,file))),reports.tableEditing.report[field].sha256,'Actual exported bytes must match independent native inspection')
if(['1.1.16','1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version)) for(const [file,hash]of [['installed-v1116-saved.xlsx',reports.workbookEditing.report.workbookInspection.sha256],['installed-v1116-producer.xlsx',reports.workbookEditing.report.workbookInspection.producerReopen.sha256]])assert.equal(digest(fs.readFileSync(path.join(directory,file))),hash,'Actual workbook bytes must match independent producer inspection')
const artifacts = receipt.artifacts.map(artifact => ({
  ...artifact, sourceFileName: artifact.fileName, fileName: artifact.fileName.replace('Long编辑_', 'LongEdit_'),
}))
if(['1.1.17','1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version))assertDocxOutputBytes(reports.docxEditing.report,file=>fs.readFileSync(path.join(directory,file)))
if(['1.1.18','1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version))assertPptxOutputBytes(reports.pptxEditing.report,file=>fs.readFileSync(path.join(directory,file)))
if(['1.1.19','1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version))assertOrganizingOutputBytes(reports.organizing.report,file=>fs.readFileSync(path.join(directory,file)))
if(['1.1.20','1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version))assertStructuredOutputBytes(reports.structuredEditing.report,file=>fs.readFileSync(path.join(directory,file)))
if(['1.1.22','1.1.23', '1.1.24'].includes(version))assertFileHistoryOutputBytes(reports.fileOperationHistory.report,file=>fs.readFileSync(path.join(directory,file)))
if(['1.1.23','1.1.24'].includes(version))assertAttachmentOutputBytes(reports.attachments.report,file=>fs.readFileSync(path.join(directory,file)))
if(version==='1.1.24')assertChapterOutputBytes(reports.chapters.report,file=>fs.readFileSync(path.join(directory,file)))
if(['1.1.21','1.1.22', '1.1.23', '1.1.24'].includes(version))assertCrossCopyOutputBytes(reports.crossLibraryCopy.report,file=>fs.readFileSync(path.join(directory,file)))
for (const artifact of artifacts) {
  assert.ok(['msi', 'nsis'].includes(artifact.target)); assert.equal(artifact.authenticodeStatus, 'NotSigned')
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/); assert.ok(artifact.sizeBytes > 0)
}
const nsis = artifacts.find(artifact => artifact.target === 'nsis')
if (['1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version)) {
  for (const [key, file] of [['searchBaseline', 'installed-v118-baseline.json'], ['searchUser', 'installed-v118-user.json'], ['searchOffice', 'installed-v118-office.json']]) {
    reports[key] = { file, report: json(path.join(directory, file)) }
  }
}
assert.equal(reports.lifecycle.report.currentInstallerSha256, nsis.sha256)
const evidenceRoot = 'docs/evidence/v' + version.replaceAll('.', '-') + '-candidate-lifecycle'
const releaseRoot = 'docs/evidence/v' + version + '-release'
assert.equal(fs.existsSync(path.join(releaseRoot,'artifact-manifest.json')),false,'An accepted review already exists; do not overwrite immutable evidence')
assert.equal(fs.existsSync(path.join(releaseRoot,'release-receipt.json')),false,'A published receipt already exists; do not overwrite it')
assert.equal(json('shared/v1-community-release-policy.json').gates.githubReleasePublished,false,'Do not re-import a published release')
fs.mkdirSync(evidenceRoot, { recursive: true }); fs.mkdirSync(releaseRoot, { recursive: true })
const files = fs.readdirSync(directory).filter(file => (/\.(?:json|jpg|png)$/i.test(file) || /^installed-v1124-(?:saved|conflict-copy|external-original)\.md$/.test(file) || /^installed-v1123-saved\.md$/.test(file) || /^installed-v1122-(?:draft\.md|later-edit\.txt|restored\.txt)$/.test(file) || /^installed-v1121-[a-z0-9-]+\.(?:md|txt|png|bin)$/.test(file) || /^installed-v1120-(?:(?:json|yaml|xml|toml)-(?:saved|copy)\.(?:jsonc|yaml|xml|toml)|unselected\.md)$/.test(file) || /^installed-v1119-(?:canvas-saved\.canvas|opml-(?:saved|original|copy)\.opml|unselected\.md)$/.test(file) || /^installed-v1118-(?:microsoft-powerpoint-16|wps-presentation|libreoffice-impress)-(?:before|source|copy)\.pptx$/.test(file) || /^installed-v1117-(?:microsoft-word-16|wps-writer|libreoffice-writer)-(?:before|source|copy)\.docx$/.test(file) || /^(?:installed-v1114-native-print\.pdf|installed-v1114-portable\.html|installed-v1115-saved\.csv|installed-v1115-export\.xlsx|installed-v1116-(?:saved|before|producer)\.xlsx)$/.test(file)) && fs.statSync(path.join(directory, file)).isFile()).sort()
for (const file of files) fs.copyFileSync(path.join(directory, file), path.join(evidenceRoot, file))
const entries = files.map(file => { const bytes = fs.readFileSync(path.join(evidenceRoot, file)); return { path: file, sizeBytes: bytes.length, sha256: digest(bytes) } })
const runtimeReports = Object.fromEntries([
  ...(version==='1.1.24' ? [['chapters',reports.chapters.file]] : []),
  ...(['1.1.23','1.1.24'].includes(version) ? [['attachments',reports.attachments.file]] : []),
  ...(['1.1.22','1.1.23', '1.1.24'].includes(version) ? [['fileOperationHistory',reports.fileOperationHistory.file]] : []),
  ...(['1.1.21','1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['crossLibraryCopy',reports.crossLibraryCopy.file]] : []),
  ...(['1.1.20','1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['structuredEditing',reports.structuredEditing.file]] : []),
  ...(['1.1.19','1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['organizing',reports.organizing.file]] : []),
  ...(['1.1.18','1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['pptxEditing',reports.pptxEditing.file]] : []),
  ...(['1.1.17','1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['docxEditing',reports.docxEditing.file]] : []),
  ...(['1.1.16','1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['workbookEditing',reports.workbookEditing.file]] : []),
  ...(['1.1.15','1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['tableEditing',reports.tableEditing.file]] : []),
  ...(['1.1.14','1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['writingDelivery',reports.writingDelivery.file]] : []),
  ...(['1.1.13','1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['pdfReading',reports.pdfReading.file]] : []),
  ...(['1.1.12','1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['contentBackup',reports.contentBackup.file]] : []),
  ...(['1.1.11','1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['graphExploration',reports.graphExploration.file]] : []),
  ...(['1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['tagCollections',reports.tagCollections.file]] : []),
  ...(['1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? [['workSession',reports.workSession.file]] : []),
  ...['workspace', 'version', 'workflow', 'experience', 'fileManagement', 'foundation', ...(['1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? ['foundationExtended'] : []), ...(['1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? ['foundationHardening'] : []), ...(['1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? ['moveContinuity'] : []), ...(['1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? ['saveHistory'] : [])].map(key => [key, reports[key].file]),
  ['routes', 'installed-route-mount-evidence.json'],
  ...(['1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? ['searchCompleteness', 'searchBaseline', 'searchUser', 'searchOffice'].map(key => [key, reports[key].file]) : []),
].map(([key, file]) => [key, { path: evidenceRoot + '/' + file, sha256: digest(fs.readFileSync(path.join(evidenceRoot, file))) }]))
const checksums = artifacts.map(artifact => artifact.sha256 + '  ' + artifact.fileName).join('\n') + '\n'
fs.writeFileSync(path.join(releaseRoot, 'SHA256SUMS.txt'), checksums)
const manifest = {
  schemaVersion: 1, stage: 'V' + version, status: 'hosted-lifecycle-and-installed-workflows-passed-ready-to-publish',
  appVersion: version, sourceVersion: version, sourceCommit: receipt.candidateSourceCommit,
  hostedRunId: reviewRun, artifactBuildRunId: buildRun, artifacts,
  checksumFile: { fileName: 'SHA256SUMS.txt', sizeBytes: Buffer.byteLength(checksums), sha256: digest(checksums) },
  qualityGate: { status: 'passed', command: 'npm run ci:patch-release', runId: buildRun },
  runtimeSmoke: { status: 'passed-installed-tauri-webview2', checksPassed: 18, routesPassed: 11, reports: runtimeReports },
  hostedInstalledLifecycle: {
    ...(version==='1.1.24' ? {chapterChecksPassed:chapterChecks.length} : {}),
    ...(['1.1.23','1.1.24'].includes(version) ? {attachmentChecksPassed:attachmentChecks.length} : {}),
    ...(['1.1.22','1.1.23', '1.1.24'].includes(version) ? {fileHistoryChecksPassed:fileHistoryChecks.length} : {}),
    ...(['1.1.21','1.1.22', '1.1.23', '1.1.24'].includes(version) ? {crossCopyChecksPassed:crossCopyChecks.length} : {}),
    ...(['1.1.20','1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {structuredEditingPassed:structuredChecks.length} : {}),
    ...(['1.1.19','1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {organizingPassed:organizingChecks.length} : {}),
    ...(['1.1.18','1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {pptxEditingChecksPassed:pptxEditingChecks.length} : {}),
    ...(['1.1.17','1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {docxEditingChecksPassed:docxEditingChecks.length} : {}),
    ...(['1.1.16','1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {workbookEditingChecksPassed:workbookEditingChecks.length} : {}),
    ...(['1.1.15','1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {tableEditingChecksPassed:tableEditingChecks.length} : {}),
    ...(['1.1.14','1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {writingDeliveryChecksPassed:writingDeliveryChecks.length} : {}),
    status: 'passed', runId: reviewRun, sourceCommit: receipt.candidateSourceCommit, evidenceRoot,
    evidenceManifest: releaseRoot + '/import-manifest.json', lifecycleChecksPassed: 22, installedWorkspaceChecksPassed: 18,
    installedRoutesPassed: 11, managementRollbackChecksPassed: 7, workflowChecksPassed: 8,
    experienceChecksPassed: 8, fileManagementChecksPassed: 9, foundationChecksPassed: 8, ...(['1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? { foundationExtendedChecksPassed: 8 } : {}),
    ...(['1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? { foundationHardeningChecksPassed: 11, harnessSourceCommit: reports.foundationHardening.report.harnessSourceCommit } : {}),
    ...(['1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? { moveContinuityChecksPassed: 13 } : {}),
    ...(['1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {saveHistoryChecksPassed:saveHistoryChecks.length} : {}),
    ...(['1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? { searchCompletenessChecksPassed: searchCompletenessChecks.length } : {}),
    versionChecksPassed: 4, failedChecks: 0, sourceUserContentIncluded: false,
    ...(['1.1.13','1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {pdfReadingChecksPassed:pdfReadingChecks.length} : {}),
    ...(['1.1.12','1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {contentBackupChecksPassed:contentBackupChecks.length} : {}),
    ...(['1.1.11','1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {graphExplorationChecksPassed:graphExplorationChecks.length} : {}),
    ...(['1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {tagCollectionChecksPassed:tagCollectionChecks.length} : {}),
    ...(['1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {workSessionChecksPassed:workSessionChecks.length} : {}),
  },
  boundaries: { communityUnsigned: true, enterprisePromotionEligible: false, releaseAssetsPublished: false, managedUpdaterReleaseAssetsPresent: false, legacyTauriUpdaterArtifactsPresent: false },
  sourceUserContentIncluded: false, releasePublished: false,
}
assertInstalledReleaseRuntime(manifest)
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
write(path.join(releaseRoot, 'artifact-manifest.json'), manifest)
write(path.join(releaseRoot, 'import-manifest.json'), {
  schemaVersion: 1, status: 'hosted-installer-lifecycle-passed', githubRunId: reviewRun, artifactBuildRunId: buildRun,
  productSourceCommit: receipt.candidateSourceCommit, appVersion: version, sourceUserContentIncluded: false,
  releaseCandidate: false,
  checks: {
    ...(version==='1.1.24' ? {chaptersPassed:chapterChecks.length} : {}),
    ...(['1.1.23','1.1.24'].includes(version) ? {attachmentsPassed:attachmentChecks.length} : {}),
    ...(['1.1.19','1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {organizingPassed:organizingChecks.length} : {}),
    ...(['1.1.18','1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {pptxEditingPassed:pptxEditingChecks.length} : {}),
    ...(['1.1.17','1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {docxEditingPassed:docxEditingChecks.length} : {}),
    ...(['1.1.16','1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {workbookEditingPassed:workbookEditingChecks.length} : {}),
    ...(['1.1.15','1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {tableEditingPassed:tableEditingChecks.length} : {}),
    ...(['1.1.14','1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {writingDeliveryPassed:writingDeliveryChecks.length} : {}),
    ...(['1.1.13','1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {pdfReadingPassed:pdfReadingChecks.length} : {}),
    ...(['1.1.12','1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {contentBackupPassed:contentBackupChecks.length} : {}),
    ...(['1.1.11','1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {graphExplorationPassed:graphExplorationChecks.length} : {}),
    ...(['1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {tagCollectionsPassed:tagCollectionChecks.length} : {}),
    ...(['1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? {workSessionPassed:workSessionChecks.length} : {}),
    lifecyclePassed: 22, lifecycleFailed: 0, installedArtifactPassed: 18, installedArtifactFailed: 0,
    installedRoutesPassed: 11, managementRollbackPassed: 7, workflowPassed: 8,
    experiencePassed: 8, fileManagementPassed: 9, foundationPassed: 8, ...(['1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? { foundationExtendedPassed: 8 } : {}), versionPassed: 4,
    ...(['1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? { foundationHardeningPassed: 11 } : {}),
    ...(['1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? { saveHistoryPassed: saveHistoryChecks.length } : {}),
    ...(['1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24'].includes(version) ? { searchCompletenessPassed: searchCompletenessChecks.length } : {}),
  },
  files: entries,
})
const community = json('shared/v1-community-release-policy.json')
assert.equal(community.appVersion, version); assert.equal(community.patchValidation.previousPublicVersion, receipt.previousVersion)
community.gates = Object.fromEntries(Object.keys(community.gates).map(key => [key, key !== 'githubReleasePublished']))
community.releaseCandidate = true; community.currentStatus = 'v' + version + '-community-release-ready-to-publish'
community.patchValidation.fullInstalledLifecycleRerun = true
community.candidate = { artifactSourceCommit: receipt.candidateSourceCommit, qualityGateCommand: 'npm run ci:patch-release', artifactBuildRunId: buildRun, hostedInstalledLifecycleRunId: reviewRun, artifacts }
community.nextAction = 'publish-verified-v' + version
write('shared/v1-community-release-policy.json', community)
const development = json('shared/development-version-policy.json')
development.binaryVersionTransition = 'v' + version + '-release-ready'
development.activeSlice.status = 'installed-workflows-passed-ready-to-publish'
write('shared/development-version-policy.json', development)
console.log('Imported immutable review and marked v' + version + ' ready; release publication remains pending.')
