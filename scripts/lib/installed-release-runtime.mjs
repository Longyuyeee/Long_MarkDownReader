import {validateInstalledStructuredHistory,assertStructuredHistoryOutputBytes} from './installed-v1-1-26-evidence.mjs'
import {validateInstalledFindReplace,assertFindReplaceOutputBytes} from './installed-v1-1-25-evidence.mjs'
import {validateInstalledCrossCopy,assertCrossCopyOutputBytes} from './installed-v1-1-21-evidence.mjs'
import {validateInstalledFileHistory,assertFileHistoryOutputBytes} from './installed-v1-1-22-evidence.mjs'
import {validateInstalledAttachments,assertAttachmentOutputBytes} from './installed-v1-1-23-evidence.mjs'
import {validateInstalledChapters,assertChapterOutputBytes} from './installed-v1-1-24-evidence.mjs'
import {validateInstalledStructured,assertStructuredOutputBytes} from './installed-v1-1-20-evidence.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { validateInstalledVersionObservations } from './installed-version-identity.mjs'
import { saveHistoryChecks } from './installed-v1-1-7-workflow.mjs'
import { moveContinuityChecks } from './installed-v1-1-6-workflow.mjs'
import { validateInstalledSearchCompleteness } from './installed-v1-1-8-evidence.mjs'
import { validateInstalledWorkSession } from './installed-v1-1-9-evidence.mjs'
import { validateInstalledTagCollections } from './installed-v1-1-10-evidence.mjs'
import { validateInstalledGraphExploration } from './installed-v1-1-11-evidence.mjs'
import { validateInstalledContentBackup } from './installed-v1-1-12-evidence.mjs'
import { validateInstalledPdfReading } from './installed-v1-1-13-evidence.mjs'
import { validateInstalledTableEditing } from './installed-v1-1-15-evidence.mjs'
import { validateInstalledWorkbookEditing } from './installed-v1-1-16-evidence.mjs'
import { validateInstalledWritingDelivery } from './installed-v1-1-14-evidence.mjs'
import { validateInstalledDocxEditing, assertDocxOutputBytes } from './installed-v1-1-17-evidence.mjs'
import { validateInstalledPptxEditing, assertPptxOutputBytes } from './installed-v1-1-18-evidence.mjs'

import {validateInstalledOrganizing,assertOrganizingOutputBytes} from './installed-v1-1-19-evidence.mjs'

export function assertInstalledReleaseRuntime(manifest, read = file => fs.readFileSync(file)) {
  const runtime = manifest.runtimeSmoke
  assert.equal(runtime.status, 'passed-installed-tauri-webview2')
  assert.equal(runtime.checksPassed, 18)
  assert.equal(runtime.routesPassed, 11)
  assert.ok(['1.0.22', '1.0.23', '1.0.24', '1.0.25', '1.0.26', '1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion))
  const versionCandidate = manifest.appVersion !== '1.0.22'
  const evidenceRoot = manifest.appVersion === '1.1.26' ? 'docs/evidence/v1-1-26-candidate-lifecycle/' : manifest.appVersion === '1.1.25' ? 'docs/evidence/v1-1-25-candidate-lifecycle/' : manifest.appVersion === '1.1.24' ? 'docs/evidence/v1-1-24-candidate-lifecycle/' : manifest.appVersion === '1.1.23' ? 'docs/evidence/v1-1-23-candidate-lifecycle/' : manifest.appVersion === '1.1.22' ? 'docs/evidence/v1-1-22-candidate-lifecycle/' : manifest.appVersion === '1.1.21' ? 'docs/evidence/v1-1-21-candidate-lifecycle/' : ['1.1.20','1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion) ? 'docs/evidence/v1-1-20-candidate-lifecycle/' : manifest.appVersion === '1.1.20' ? 'docs/evidence/v1-1-19-candidate-lifecycle/' : manifest.appVersion === '1.1.19' ? 'docs/evidence/v1-1-19-candidate-lifecycle/' : manifest.appVersion === '1.1.19' ? 'docs/evidence/v1-1-19-candidate-lifecycle/' : manifest.appVersion === '1.1.18' ? 'docs/evidence/v1-1-18-candidate-lifecycle/' : manifest.appVersion === '1.1.17' ? 'docs/evidence/v1-1-17-candidate-lifecycle/' : ['1.1.16','1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion) ? 'docs/evidence/v1-1-16-candidate-lifecycle/' : ['1.1.15','1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion) ? 'docs/evidence/v1-1-15-candidate-lifecycle/' : ['1.1.14','1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion) ? 'docs/evidence/v1-1-14-candidate-lifecycle/' : ['1.1.13','1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion) ? 'docs/evidence/v1-1-13-candidate-lifecycle/' : ['1.1.12','1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion) ? 'docs/evidence/v1-1-12-candidate-lifecycle/' : ['1.1.11','1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion) ? 'docs/evidence/v1-1-11-candidate-lifecycle/' : ['1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion) ? 'docs/evidence/v1-1-10-candidate-lifecycle/' : ['1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion) ? 'docs/evidence/v1-1-9-candidate-lifecycle/' : manifest.appVersion === '1.1.8' ? 'docs/evidence/v1-1-8-candidate-lifecycle/' : manifest.appVersion === '1.1.7' ? 'docs/evidence/v1-1-7-candidate-lifecycle/' : manifest.appVersion === '1.1.6' ? 'docs/evidence/v1-1-6-candidate-lifecycle/' : manifest.appVersion === '1.1.5' ? 'docs/evidence/v1-1-5-candidate-lifecycle/' : manifest.appVersion === '1.1.4' ? 'docs/evidence/v1-1-4-candidate-lifecycle/' : manifest.appVersion === '1.1.3' ? 'docs/evidence/v1-1-3-candidate-lifecycle/' : manifest.appVersion === '1.1.2' ? 'docs/evidence/v1-1-2-candidate-lifecycle/' : manifest.appVersion === '1.1.1' ? 'docs/evidence/v1-1-1-candidate-lifecycle/' : manifest.appVersion === '1.1.0' ? 'docs/evidence/v1-1-0-candidate-lifecycle/' : manifest.appVersion === '1.0.26' ? 'docs/evidence/v126-candidate-lifecycle/' : manifest.appVersion === '1.0.25' ? 'docs/evidence/v125-candidate-lifecycle/' : manifest.appVersion === '1.0.24' ? 'docs/evidence/v124-candidate-lifecycle/' : versionCandidate ? 'docs/evidence/v123-installed-visual-review/' : 'docs/evidence/v122-installed-search/'
  const reports = Object.fromEntries(Object.entries(runtime.reports).map(([name, item]) => {
    assert.equal(item.path, evidenceRoot + path.posix.basename(item.path))
    const bytes = read(item.path)
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, `${name} raw evidence changed`)
    return [name, JSON.parse(bytes)]
  }))
  if (['1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    const report = reports.saveHistory
    assert.equal(report.status,'passed'); assert.equal(report.appVersion,manifest.appVersion)
    assert.equal(report.sourceCommit,manifest.sourceCommit)
    assert.equal(report.installerSha256,manifest.artifacts.find(item=>item.target==='nsis').sha256)
    assert.equal(report.evidenceLevel,'installed-tauri-ipc-and-disk');assert.equal(report.sourceUserContentIncluded,false)
    assert.deepEqual(report.checks.map(check=>[check.id,check.status]),saveHistoryChecks.map(id=>[id,'passed']))
  }
  if(['1.1.15','1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledTableEditing(reports.tableEditing,manifest)
    assert.equal(reports.tableEditing.executableSha256,reports.searchCompleteness.executableSha256)
    assert.equal(reports.tableEditing.harnessSourceCommit,reports.searchCompleteness.harnessSourceCommit)
    for(const[field,file]of [['csvInspection','installed-v1115-saved.csv'],['xlsxInspection','installed-v1115-export.xlsx']])assert.equal(crypto.createHash('sha256').update(read(evidenceRoot+file)).digest('hex'),reports.tableEditing[field].sha256,'Actual table delivery bytes changed')
  }
  if(['1.1.16','1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledWorkbookEditing(reports.workbookEditing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.workbookEditing[key],reports.searchCompleteness[key])
    const inspection=reports.workbookEditing.workbookInspection
    for(const[file,hash]of [['installed-v1116-saved.xlsx',inspection.sha256],['installed-v1116-before.xlsx',inspection.beforeSha256],['installed-v1116-producer.xlsx',inspection.producerReopen.sha256]])assert.equal(crypto.createHash('sha256').update(read(evidenceRoot+file)).digest('hex'),hash,'Actual workbook bytes changed')
  }
  if(manifest.appVersion==='1.1.26'){
    validateInstalledStructuredHistory(reports.structuredHistory,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.structuredHistory[key],reports.searchCompleteness[key])
    assertStructuredHistoryOutputBytes(reports.structuredHistory,file=>read(evidenceRoot+file))
  }
  if(['1.1.25','1.1.26'].includes(manifest.appVersion)){
    validateInstalledFindReplace(reports.findReplace,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.findReplace[key],reports.searchCompleteness[key])
    assertFindReplaceOutputBytes(reports.findReplace,file=>read(evidenceRoot+file))
  }
  if(['1.1.24','1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledChapters(reports.chapters,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.chapters[key],reports.searchCompleteness[key])
    assertChapterOutputBytes(reports.chapters,file=>read(evidenceRoot+file))
  }
  if(['1.1.23','1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledAttachments(reports.attachments,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.attachments[key],reports.searchCompleteness[key])
    assertAttachmentOutputBytes(reports.attachments,file=>read(evidenceRoot+file))
  }
  if(['1.1.22','1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledFileHistory(reports.fileOperationHistory,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.fileOperationHistory[key],reports.searchCompleteness[key])
    assertFileHistoryOutputBytes(reports.fileOperationHistory,file=>read(evidenceRoot+file))
  }
  if(['1.1.21','1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledCrossCopy(reports.crossLibraryCopy,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.crossLibraryCopy[key],reports.searchCompleteness[key])
    assertCrossCopyOutputBytes(reports.crossLibraryCopy,file=>read(evidenceRoot+file))
  }
  if(['1.1.20','1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledStructured(reports.structuredEditing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.structuredEditing[key],reports.searchCompleteness[key])
    assertStructuredOutputBytes(reports.structuredEditing,file=>read(evidenceRoot+file))
  }
  if(['1.1.19','1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledOrganizing(reports.organizing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.organizing[key],reports.searchCompleteness[key])
    assertOrganizingOutputBytes(reports.organizing,file=>read(evidenceRoot+file))
  }
  if(['1.1.18','1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledPptxEditing(reports.pptxEditing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.pptxEditing[key],reports.searchCompleteness[key])
    assertPptxOutputBytes(reports.pptxEditing,file=>read(evidenceRoot+file))
  }
  if(['1.1.17','1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledDocxEditing(reports.docxEditing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.docxEditing[key],reports.searchCompleteness[key])
    assertDocxOutputBytes(reports.docxEditing,file=>read(evidenceRoot+file))
  }
  const { workspace, routes, search, version, stability } = reports
  if(['1.1.14','1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)){
    validateInstalledWritingDelivery(reports.writingDelivery,manifest)
    assert.equal(reports.writingDelivery.executableSha256,reports.searchCompleteness.executableSha256)
    assert.equal(reports.writingDelivery.harnessSourceCommit,reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.13','1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    validateInstalledPdfReading(reports.pdfReading, manifest)
    assert.equal(reports.pdfReading.executableSha256, reports.searchCompleteness.executableSha256)
    assert.equal(reports.pdfReading.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.12','1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    validateInstalledContentBackup(reports.contentBackup, manifest)
    assert.equal(reports.contentBackup.executableSha256, reports.searchCompleteness.executableSha256)
    assert.equal(reports.contentBackup.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.11','1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    validateInstalledGraphExploration(reports.graphExploration, manifest)
    assert.equal(reports.graphExploration.executableSha256, reports.searchCompleteness.executableSha256)
    assert.equal(reports.graphExploration.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    validateInstalledTagCollections(reports.tagCollections, manifest)
    assert.equal(reports.tagCollections.executableSha256, reports.searchCompleteness.executableSha256)
    assert.equal(reports.tagCollections.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    validateInstalledWorkSession(reports.workSession, manifest)
    assert.equal(reports.workSession.executableSha256, reports.searchCompleteness.executableSha256, 'all current/historical tasks must use the same installed executable')
    assert.equal(reports.workSession.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit, 'all current/historical tasks must use the same review driver')
  }
  if (['1.1.8','1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    validateInstalledSearchCompleteness(reports.searchCompleteness, reports.searchBaseline, reports.searchUser, reports.searchOffice, manifest)
  }
  if (['1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    const report = reports.moveContinuity
    assert.equal(report.status, 'passed'); assert.equal(report.appVersion, manifest.appVersion)
    assert.equal(report.sourceCommit, manifest.sourceCommit)
    assert.equal(report.installerSha256, manifest.artifacts.find(item => item.target === 'nsis').sha256)
    assert.equal(report.evidenceLevel, 'installed-tauri-ipc-and-disk'); assert.equal(report.sourceUserContentIncluded, false)
    assert.deepEqual(report.checks.map(check => [check.id, check.status]), moveContinuityChecks.map(id => [id, 'passed']))
  }
  if (['1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    const hardening = reports.foundationHardening
    assert.equal(hardening.status, 'passed'); assert.equal(hardening.appVersion, manifest.appVersion)
    assert.equal(hardening.sourceCommit, manifest.sourceCommit)
    assert.match(hardening.harnessSourceCommit, /^[a-f0-9]{40}$/, 'v115 installer harness revision is required independently of the product revision')
    assert.equal(hardening.installerSha256, manifest.artifacts.find(item => item.target === 'nsis').sha256)
    assert.equal(hardening.evidenceLevel, 'installed-tauri-ipc-and-disk'); assert.equal(hardening.sourceUserContentIncluded, false)
    assert.deepEqual(hardening.checks.map(check => [check.id, check.status]), [
      'unauthorized-import-is-rejected-without-changing-library',
      'external-window-commands-return-without-blocking-native-ipc',
      'same-name-document-and-local-images-never-overwrite-existing-content',
      'batch-import-reports-partial-failure-without-publishing-missing-image-note',
      'retrying-only-failed-source-retains-completed-file-identities',
      'shared-native-search-matches-txt-json-and-configured-library-scope',
      'palette-scope-dropdown-is-clickable-and-shows-real-native-results',
      'invalid-query-and-genuine-empty-state-are-distinct',
      'search-result-opens-in-main-editor-without-replacing-reference',
      'actual-typing-blocks-cross-library-open-until-explicit-save',
      'v115-workflows-have-no-global-error-overlay',
    ].map(id => [id, 'passed']))
  }
  if (['1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    const extended = reports.foundationExtended
    assert.equal(extended.status, 'passed'); assert.equal(extended.appVersion, manifest.appVersion)
    assert.equal(extended.sourceCommit, manifest.sourceCommit)
    assert.equal(extended.installerSha256, manifest.artifacts.find(item => item.target === 'nsis').sha256)
    assert.equal(extended.evidenceLevel, 'installed-tauri-ipc-and-disk'); assert.equal(extended.sourceUserContentIncluded, false)
    assert.deepEqual(extended.checks.map(check => [check.id, check.status]), [
      'portable-template-roundtrip-retains-variables', 'invalid-template-export-preserves-file-and-defaults',
      'native-rename-preview-preserves-format-and-reports-invalid-names', 'txt-partial-restore-retains-other-change-and-disk',
      'txt-partial-restore-can-be-undone', 'markdown-partial-restore-retains-other-change-and-disk',
      'batch-context-dialog-renames-real-files-and-retains-current-draft', 'v114-workflows-have-no-global-error-overlay',
    ].map(id => [id, 'passed']))
  }
  if (['1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    const foundation = reports.foundation
    assert.equal(foundation.status, 'passed')
    assert.equal(foundation.appVersion, manifest.appVersion)
    assert.equal(foundation.sourceCommit, manifest.sourceCommit)
    assert.equal(foundation.installerSha256, manifest.artifacts.find(item => item.target === 'nsis').sha256)
    assert.equal(foundation.evidenceLevel, 'installed-tauri-ipc-and-disk')
    assert.equal(foundation.sourceUserContentIncluded, false)
    assert.deepEqual(foundation.checks.map(check => [check.id, check.status]), [
      'template-dialog-persists-custom-content', 'library-default-template-survives-native-read',
      'template-variables-and-unique-title-written-to-disk', 'tab-pin-context-menu-updates-installed-ui',
      'multiple-tag-filter-reads-real-notes', 'manual-relation-edit-retains-files-and-refreshes-list',
      'txt-history-dialog-creates-copy-without-overwrite', 'foundation-workflow-has-no-global-error-overlay',
    ].map(id => [id, 'passed']))
  }
  if (['1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    const files = reports.fileManagement
    assert.equal(files.status, 'passed')
    assert.equal(files.appVersion, manifest.appVersion)
    assert.equal(files.sourceCommit, manifest.sourceCommit)
    assert.equal(files.installerSha256, manifest.artifacts.find(a => a.target === 'nsis').sha256)
    assert.equal(files.evidenceLevel, 'installed-tauri-ipc-and-disk')
    assert.equal(files.sourceUserContentIncluded, false)
    assert.deepEqual(files.checks.map(c => [c.id, c.status]), [
      'context-duplicate-writes-real-copy-and-preserves-source',
      'move-dialog-creates-directory-and-updates-active-path',
      'context-undo-restores-original-file',
      'recycle-keeps-recoverable-content-without-source-file',
      'recycle-dialog-restores-real-file',
      'native-copy-command-preserves-source-and-new-directory',
      'native-purge-removes-only-selected-trash-content',
      'native-move-and-undo-commands-registered',
      'no-global-error-overlay-after-file-operations',
    ].map(id => [id, 'passed']))
  }
  if (['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    const experience = reports.experience
    assert.equal(experience.status, 'passed')
    assert.equal(experience.appVersion, manifest.appVersion)
    assert.equal(experience.sourceCommit, manifest.sourceCommit)
    assert.equal(experience.installerSha256, manifest.artifacts.find(a => a.target === 'nsis').sha256)
    assert.equal(experience.evidenceLevel, 'installed-tauri-ipc-and-disk')
    assert.equal(experience.sourceUserContentIncluded, false)
    assert.deepEqual(experience.checks.map(c=>[c.id,c.status]), [
      'missing-default-inbox-is-normal-empty', 'first-inbox-note-is-created-in-place',
      'any-file-catalog-includes-attachments', 'toolbar-dialog-saves-cross-format-relation',
      'relationship-persisted-without-editing-files', 'manual-relationship-in-native-graph',
      'renaming-retains-file-relationship', 'removing-relation-retains-both-files',
    ].map(id=>[id,'passed']))
  }
  if (['1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26'].includes(manifest.appVersion)) {
    const workflow = reports.workflow
    assert.equal(workflow.status, 'passed')
    assert.equal(workflow.appVersion, manifest.appVersion)
    assert.equal(workflow.sourceCommit, manifest.sourceCommit)
    assert.equal(workflow.installerSha256, manifest.artifacts.find(a => a.target === 'nsis').sha256)
    assert.equal(workflow.evidenceLevel, 'installed-tauri-ipc-and-disk')
    assert.equal(workflow.sourceUserContentIncluded, false)
    assert.deepEqual(workflow.checks.map(c=>[c.id,c.status]), [
      'smart-collection-live-directory-tag-filter', 'quick-note-direct-selected-directory',
      'quick-note-idempotent-retry', 'smart-collection-reflects-new-save',
      'history-copy-preserves-original', 'history-prepare-protects-draft',
      'stale-history-restore-is-rejected', 'installed-main-editor-layout',
    ].map(id=>[id,'passed']))
    assert.ok(workflow.layout.editor.height > 150 && workflow.layout.nav.width > 0 && workflow.layout.tabs.height > 0 && !workflow.layout.errors)
  }
  assert.equal(workspace.status, 'passed')
  assert.equal(workspace.appVersion, manifest.appVersion)
  assert.equal(workspace.installerSha256, manifest.artifacts.find(a => a.target === 'nsis').sha256)
  assert.equal(workspace.sourceUserContentIncluded, false)
  assert.equal(workspace.checks.length, 18)
  assert.ok(workspace.checks.every(c => c.status === 'passed'))
  for (const id of ['installed-current-webview-bootstrap', 'installed-txt-read-edit-save-reopen', 'installed-json-read-edit-save-reopen', 'installed-representative-right-side-routes', 'installed-route-performance-export']) {
    assert.ok(workspace.checks.some(c => c.id === id), `missing runtime task: ${id}`)
  }
  assert.equal(routes.evidenceLevel, 'installed-current-tauri-webview2')
  assert.equal(routes.routes.length, 11)
  assert.equal(new Set(routes.routes.map(r => r.route)).size, 11)
  assert.ok(routes.routes.every(r => r.status === 'passed' && !r.crashFallbackVisible && r.routeWrapperMounted))
  if (manifest.appVersion === '1.0.24') {
    assert.equal(stability.status, 'passed')
    assert.equal(stability.appVersion, manifest.appVersion)
    assert.equal(stability.sourceCommit, manifest.sourceCommit)
    assert.equal(stability.installerSha256, workspace.installerSha256)
    assert.equal(stability.sourceUserContentIncluded, false)
    assert.equal(stability.markdown.status, 'passed')
    assert.ok(['full', 'reduced'].includes(stability.markdown.motionMode))
    if (stability.markdown.motionMode === 'reduced') {
      assert.equal(stability.markdown.activeAnimations, 0)
      assert.ok(['preference', 'sustained-slow-frames'].includes(stability.markdown.motionReason))
    } else {
      assert.ok(stability.markdown.activeAnimations > 0)
      assert.equal(stability.markdown.motionReason, 'normal')
    }
    assert.equal(stability.markdown.headings, 225)
    assert.equal(stability.markdown.typingVisible, true)
    assert.equal(stability.observations.length, 5)
    assert.ok(stability.observations.every(item => item.status === 'passed'))
    const layouts = stability.observations.filter(item => item.id === 'graph-layout')
    assert.deepEqual(layouts.map(item => [item.width, item.height, item.expanded]), [[1280,820,false],[1280,820,true],[720,600,false],[720,600,true]])
    for (const item of layouts) {
      assert.equal(item.tutorialUnobscured, true)
      assert.ok(item.rects.options.bottom <= item.rects.legend.top + 1)
      assert.ok(item.rects.legend.bottom <= item.rects.banner.top + 1)
      assert.ok(item.rects.banner.bottom <= item.rects.canvas.top + 1)
      assert.ok(item.rects.banner.bottom <= item.rects.tutorial.top + 1)
      assert.ok(item.rects.legend.bottom <= item.rects.canvas.top + 1)
      assert.ok(item.rects.legend.bottom <= item.rects.tutorial.top + 1)
      assert.ok(item.rects.tutorial.bottom <= item.height + 1)
    }
    assert.equal(stability.observations.at(-1).id, 'native-close-cancel-preserves-draft')
  }
  if (versionCandidate) {
    assert.equal(version.sourceCommit, manifest.sourceCommit)
    assert.equal(version.installerSha256, workspace.installerSha256)
    assert.equal(version.appVersion, manifest.appVersion)
    assert.equal(version.sourceUserContentIncluded, false)
    assert.equal(version.evidenceLevel, 'installed-webview-input-events')
    assert.equal(version.status, 'passed')
    assert.deepEqual(version.checks.map(c=>[c.id,c.status]), ['native-version-and-sidebar', 'badge-opens-settings', 'real-update-preserves-installed-version', 'production-capability-no-dev'].map(id=>[id,'passed']))
    validateInstalledVersionObservations(version.observations, manifest.appVersion)
    return
  }
  assert.equal(search.sourceCommit, manifest.sourceCommit)
  assert.equal(search.installerSha256, workspace.installerSha256)
  assert.equal(search.status, 'passed')
  assert.equal(search.checks.length, 4)
  assert.ok(search.checks.every(c => c.status === 'passed'))
}
