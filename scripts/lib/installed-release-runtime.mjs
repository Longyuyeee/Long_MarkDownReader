import {validateInstalledRecentSearch,assertRecentSearchOutputBytes} from './installed-v1-3-9-evidence.mjs'
import {validateInstalledSelectiveReplacement,assertSelectiveReplacementOutputBytes} from './installed-v1-3-8-evidence.mjs'
import {validateInstalledReplacementPreview,assertReplacementPreviewOutputBytes} from './installed-v1-3-7-evidence.mjs'
import {validateInstalledSourceScope,assertSourceScopeOutputBytes} from './installed-v1-3-6-evidence.mjs'
import {validateInstalledSourceSearch,assertSourceSearchOutputBytes} from './installed-v1-3-5-evidence.mjs'
import {validateInstalledSourcePosition,assertSourcePositionOutputBytes} from './installed-v1-3-4-evidence.mjs'
import {validateInstalledOutlineContinuity,assertOutlineContinuityOutputBytes} from './installed-v1-3-3-evidence.mjs'
import {validateInstalledOutlineNavigation,assertOutlineNavigationOutputBytes} from './installed-v1-3-2-evidence.mjs'
import {validateInstalledYamlBlockFieldDelete,assertYamlBlockFieldDeleteOutputBytes} from './installed-v1-3-1-evidence.mjs'
import {validateInstalledTomlBlockFieldDelete,assertTomlBlockFieldDeleteOutputBytes} from './installed-v1-2-45-evidence.mjs'
import {validateInstalledTomlBlockArrayDelete,assertTomlBlockArrayDeleteOutputBytes} from './installed-v1-2-44-evidence.mjs'
import {validateInstalledTomlBlockFields,assertTomlBlockFieldsOutputBytes} from './installed-v1-2-43-evidence.mjs'
import {validateInstalledTomlBlockArrays,assertTomlBlockArraysOutputBytes} from './installed-v1-2-42-evidence.mjs'
import {validateInstalledYamlBlockFields,assertYamlBlockFieldsOutputBytes} from './installed-v1-2-41-evidence.mjs'
import {validateInstalledYamlBlockOperations,assertYamlBlockOperationsOutputBytes} from './installed-v1-2-40-evidence.mjs'
import {validateInstalledTomlArrayMultiline,assertTomlArrayMultilineOutputBytes} from './installed-v1-2-39-evidence.mjs'
import {validateInstalledYamlSequenceBlock,assertYamlSequenceBlockOutputBytes} from './installed-v1-2-38-evidence.mjs'
import {validateInstalledTomlBasic,assertTomlBasicOutputBytes} from './installed-v1-2-37-evidence.mjs'
import {validateInstalledYamlFolded,assertYamlFoldedOutputBytes} from './installed-v1-2-36-evidence.mjs'
import {validateInstalledTomlLiteral,assertTomlLiteralOutputBytes} from './installed-v1-2-35-evidence.mjs'
import {validateInstalledYamlLiteral,assertYamlLiteralOutputBytes} from './installed-v1-2-34-evidence.mjs'
import {validateInstalledTomlDatetime,assertTomlDatetimeOutputBytes} from './installed-v1-2-33-evidence.mjs'
import {validateInstalledTomlFieldOrder,assertTomlFieldOrderOutputBytes} from './installed-v1-2-32-evidence.mjs'
import {validateInstalledYamlFieldOrder,assertYamlFieldOrderOutputBytes} from './installed-v1-2-31-evidence.mjs'
import {validateInstalledTomlFieldCopy,assertTomlFieldCopyOutputBytes} from './installed-v1-2-30-evidence.mjs'
import {validateInstalledYamlFieldCopy,assertYamlFieldCopyOutputBytes} from './installed-v1-2-29-evidence.mjs'
import {validateInstalledTomlOrder,assertTomlOrderOutputBytes} from './installed-v1-2-28-evidence.mjs'
import {validateInstalledYamlOrder,assertYamlOrderOutputBytes} from './installed-v1-2-27-evidence.mjs'
import {validateInstalledListCopy,assertListCopyOutputBytes} from './installed-v1-2-26-evidence.mjs'
import {validateInstalledTomlItemValues,assertTomlItemValuesOutputBytes} from './installed-v1-2-25-evidence.mjs'
import {validateInstalledTomlArrays,assertTomlArraysOutputBytes} from './installed-v1-2-24-evidence.mjs'
import {validateInstalledYamlSequences,assertYamlSequencesOutputBytes} from './installed-v1-2-23-evidence.mjs'
import {validateInstalledTomlFields,assertTomlFieldsOutputBytes} from './installed-v1-2-22-evidence.mjs'
import {validateInstalledYamlFields,assertYamlFieldsOutputBytes} from './installed-v1-2-21-evidence.mjs'
import {validateInstalledTomlRename,assertTomlRenameOutputBytes} from './installed-v1-2-20-evidence.mjs'
import {validateInstalledYamlRename,assertYamlRenameOutputBytes} from './installed-v1-2-19-evidence.mjs'
import {validateInstalledXmlCreate,assertXmlCreateOutputBytes} from './installed-v1-2-18-evidence.mjs'
import {validateInstalledSavepoint,assertSavepointOutputBytes} from './installed-v1-2-17-evidence.mjs'
import {validateInstalledXmlManage,assertXmlManageOutputBytes} from './installed-v1-2-16-evidence.mjs'
import {validateInstalledXmlDelete,assertXmlDeleteOutputBytes} from './installed-v1-2-15-evidence.mjs'
import {validateInstalledXmlOrder,assertXmlOrderOutputBytes} from './installed-v1-2-14-evidence.mjs'
import {validateInstalledXmlElement,assertXmlElementOutputBytes} from './installed-v1-2-13-evidence.mjs'
import {validateInstalledXmlText,assertXmlTextOutputBytes} from './installed-v1-2-12-evidence.mjs'
import {validateInstalledXmlAttribute,assertXmlAttributeOutputBytes} from './installed-v1-2-11-evidence.mjs'
import {validateInstalledYamlValue,assertYamlValueOutputBytes} from './installed-v1-2-10-evidence.mjs'
import {validateInstalledTomlValue,assertTomlValueOutputBytes} from './installed-v1-2-9-evidence.mjs'
import {validateInstalledJsonNodeCopy,assertJsonNodeCopyOutputBytes} from './installed-v1-2-8-evidence.mjs'
import {validateInstalledJsonArray,assertJsonArrayOutputBytes} from './installed-v1-2-7-evidence.mjs'
import {validateInstalledTableColumns,assertTableColumnOutputBytes} from './installed-v1-2-6-evidence.mjs'
import {validateInstalledTableRows,assertTableRowOutputBytes} from './installed-v1-2-5-evidence.mjs'
import {validateInstalledTableFill,assertTableFillOutputBytes} from './installed-v1-2-4-evidence.mjs'
import {annotationBatchChecks,validateInstalledAnnotationBatch,assertAnnotationBatchOutputBytes} from './installed-v1-2-3-evidence.mjs'
import {validateInstalledAnnotationHistory,assertAnnotationHistoryOutputBytes} from './installed-v1-2-2-evidence.mjs'
import {validateInstalledReadingMove,assertReadingMoveOutputBytes} from './installed-v1-2-1-evidence.mjs'
import {validateInstalledPdfResume,assertPdfResumeOutputBytes} from './installed-v1-1-37-evidence.mjs'
import {validateInstalledContextCommands,assertContextCommandOutputBytes} from './installed-v1-1-36-evidence.mjs'
import {validateInstalledAttachmentDrafts,assertAttachmentDraftOutputBytes} from './installed-v1-1-35-evidence.mjs'
import {validateInstalledPortableChapters,assertPortableChapterOutputBytes} from './installed-v1-1-34-evidence.mjs'
import {validateInstalledCopyReading,assertCopyReadingOutputBytes} from './installed-v1-1-33-evidence.mjs'
import {validateInstalledRestoreContinuity,assertRestoreContinuityOutputBytes} from './installed-v1-1-32-evidence.mjs'
import {validateInstalledWorkbookEntry,assertWorkbookEntryOutputBytes} from './installed-v1-1-31-evidence.mjs'
import {validateInstalledTableValidation,assertTableValidationOutputBytes} from './installed-v1-1-30-evidence.mjs'
import {validateInstalledPdfContinuity,assertPdfContinuityOutputBytes} from './installed-v1-1-29-evidence.mjs'
import {validateInstalledReferenceRepair,assertReferenceRepairOutputBytes} from './installed-v1-1-28-evidence.mjs'
import {validateInstalledCollectionReuse,assertCollectionReuseOutputBytes} from './installed-v1-1-27-evidence.mjs'
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
  assert.ok(['1.0.22', '1.0.23', '1.0.24', '1.0.25', '1.0.26', '1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion))
  const versionCandidate = manifest.appVersion !== '1.0.22'
  const evidenceRoot = /^1\.[123]\.\d+$/.test(manifest.appVersion)
    ? `docs/evidence/v${manifest.appVersion.replaceAll('.','-')}-candidate-lifecycle/`
    : ({'1.0.22':'docs/evidence/v122-installed-search/', '1.0.23':'docs/evidence/v123-installed-visual-review/', '1.0.24':'docs/evidence/v124-candidate-lifecycle/', '1.0.25':'docs/evidence/v125-candidate-lifecycle/', '1.0.26':'docs/evidence/v126-candidate-lifecycle/'})[manifest.appVersion]
  assert.ok(evidenceRoot, 'Recognized release must use its own evidence directory')
  const reports = Object.fromEntries(Object.entries(runtime.reports).map(([name, item]) => {
    assert.equal(item.path, evidenceRoot + path.posix.basename(item.path))
    const bytes = read(item.path)
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, `${name} raw evidence changed`)
    return [name, JSON.parse(bytes)]
  }))
  if (['1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    const report = reports.saveHistory
    assert.equal(report.status,'passed'); assert.equal(report.appVersion,manifest.appVersion)
    assert.equal(report.sourceCommit,manifest.sourceCommit)
    assert.equal(report.installerSha256,manifest.artifacts.find(item=>item.target==='nsis').sha256)
    assert.equal(report.evidenceLevel,'installed-tauri-ipc-and-disk');assert.equal(report.sourceUserContentIncluded,false)
    assert.deepEqual(report.checks.map(check=>[check.id,check.status]),saveHistoryChecks.map(id=>[id,'passed']))
  }
  if(['1.1.15','1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTableEditing(reports.tableEditing,manifest)
    assert.equal(reports.tableEditing.executableSha256,reports.searchCompleteness.executableSha256)
    assert.equal(reports.tableEditing.harnessSourceCommit,reports.searchCompleteness.harnessSourceCommit)
    for(const[field,file]of [['csvInspection','installed-v1115-saved.csv'],['xlsxInspection','installed-v1115-export.xlsx']])assert.equal(crypto.createHash('sha256').update(read(evidenceRoot+file)).digest('hex'),reports.tableEditing[field].sha256,'Actual table delivery bytes changed')
  }
  if(['1.1.16','1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledWorkbookEditing(reports.workbookEditing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.workbookEditing[key],reports.searchCompleteness[key])
    const inspection=reports.workbookEditing.workbookInspection
    for(const[file,hash]of [['installed-v1116-saved.xlsx',inspection.sha256],['installed-v1116-before.xlsx',inspection.beforeSha256],['installed-v1116-producer.xlsx',inspection.producerReopen.sha256]])assert.equal(crypto.createHash('sha256').update(read(evidenceRoot+file)).digest('hex'),hash,'Actual workbook bytes changed')
  }
  if(['1.2.32','1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlFieldOrder(reports.tomlFieldOrder,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlFieldOrder[key],reports.searchCompleteness[key])
    assertTomlFieldOrderOutputBytes(reports.tomlFieldOrder,file=>read(evidenceRoot+file))
  }
  if(['1.2.33','1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlDatetime(reports.tomlDatetime,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlDatetime[key],reports.searchCompleteness[key])
    assertTomlDatetimeOutputBytes(reports.tomlDatetime,file=>read(evidenceRoot+file))
  }
  if(['1.2.34','1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlLiteral(reports.yamlLiteral,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlLiteral[key],reports.searchCompleteness[key])
    assertYamlLiteralOutputBytes(reports.yamlLiteral,file=>read(evidenceRoot+file))
  }
  if(['1.2.35','1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlLiteral(reports.tomlLiteral,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlLiteral[key],reports.searchCompleteness[key])
    assertTomlLiteralOutputBytes(reports.tomlLiteral,file=>read(evidenceRoot+file))
  }
  if(['1.2.36','1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlFolded(reports.yamlFolded,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlFolded[key],reports.searchCompleteness[key])
    assertYamlFoldedOutputBytes(reports.yamlFolded,file=>read(evidenceRoot+file))
  }
  if(['1.2.37','1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlBasic(reports.tomlBasic,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlBasic[key],reports.searchCompleteness[key])
    assertTomlBasicOutputBytes(reports.tomlBasic,file=>read(evidenceRoot+file))
  }
  if(['1.2.38','1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlSequenceBlock(reports.yamlSequenceBlock,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlSequenceBlock[key],reports.searchCompleteness[key])
    assertYamlSequenceBlockOutputBytes(reports.yamlSequenceBlock,file=>read(evidenceRoot+file))
  }
  if(['1.2.39','1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlArrayMultiline(reports.tomlArrayMultiline,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlArrayMultiline[key],reports.searchCompleteness[key])
    assertTomlArrayMultilineOutputBytes(reports.tomlArrayMultiline,file=>read(evidenceRoot+file))
  }
  if(['1.2.40','1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlBlockOperations(reports.yamlBlockOperations,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlBlockOperations[key],reports.searchCompleteness[key])
    assertYamlBlockOperationsOutputBytes(reports.yamlBlockOperations,file=>read(evidenceRoot+file))
  }
  if(['1.2.41','1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlBlockFields(reports.yamlBlockFields,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlBlockFields[key],reports.searchCompleteness[key])
    assertYamlBlockFieldsOutputBytes(reports.yamlBlockFields,file=>read(evidenceRoot+file))
  }
  if(['1.2.42','1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlBlockArrays(reports.tomlBlockArrays,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlBlockArrays[key],reports.searchCompleteness[key])
    assertTomlBlockArraysOutputBytes(reports.tomlBlockArrays,file=>read(evidenceRoot+file))
  }
  if(['1.2.43','1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlBlockFields(reports.tomlBlockFields,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlBlockFields[key],reports.searchCompleteness[key])
    assertTomlBlockFieldsOutputBytes(reports.tomlBlockFields,file=>read(evidenceRoot+file))
  }
  if(['1.2.44','1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlBlockArrayDelete(reports.tomlBlockArrayDelete,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlBlockArrayDelete[key],reports.searchCompleteness[key])
    assertTomlBlockArrayDeleteOutputBytes(reports.tomlBlockArrayDelete,file=>read(evidenceRoot+file))
  }
  if(['1.2.45','1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlBlockFieldDelete(reports.tomlBlockFieldDelete,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlBlockFieldDelete[key],reports.searchCompleteness[key])
    assertTomlBlockFieldDeleteOutputBytes(reports.tomlBlockFieldDelete,file=>read(evidenceRoot+file))
  }
  if(['1.3.1','1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlBlockFieldDelete(reports.yamlBlockFieldDelete,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlBlockFieldDelete[key],reports.searchCompleteness[key])
    assertYamlBlockFieldDeleteOutputBytes(reports.yamlBlockFieldDelete,file=>read(evidenceRoot+file))
  }
  if(['1.3.2','1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledOutlineNavigation(reports.outlineNavigation,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.outlineNavigation[key],reports.searchCompleteness[key])
    assertOutlineNavigationOutputBytes(reports.outlineNavigation,file=>read(evidenceRoot+file))
  }
  if(['1.3.3','1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledOutlineContinuity(reports.outlineContinuity,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.outlineContinuity[key],reports.searchCompleteness[key])
    assertOutlineContinuityOutputBytes(reports.outlineContinuity,file=>read(evidenceRoot+file))
  }
  if(['1.3.4','1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledSourcePosition(reports.sourcePosition,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.sourcePosition[key],reports.searchCompleteness[key])
    assertSourcePositionOutputBytes(reports.sourcePosition,file=>read(evidenceRoot+file))
  }
  if(['1.3.5','1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledSourceSearch(reports.sourceSearch,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.sourceSearch[key],reports.searchCompleteness[key])
    assertSourceSearchOutputBytes(reports.sourceSearch,file=>read(evidenceRoot+file))
  }
  if(['1.3.6','1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledSourceScope(reports.sourceScope,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.sourceScope[key],reports.searchCompleteness[key])
    assertSourceScopeOutputBytes(reports.sourceScope,file=>read(evidenceRoot+file))
  }
  if(['1.3.7','1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledReplacementPreview(reports.replacementPreview,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.replacementPreview[key],reports.searchCompleteness[key])
    assertReplacementPreviewOutputBytes(reports.replacementPreview,file=>read(evidenceRoot+file))
  }
  if(['1.3.8','1.3.9'].includes(manifest.appVersion)){
    validateInstalledSelectiveReplacement(reports.selectiveReplacement,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.selectiveReplacement[key],reports.searchCompleteness[key])
    assertSelectiveReplacementOutputBytes(reports.selectiveReplacement,file=>read(evidenceRoot+file))
  }
  if(manifest.appVersion==='1.3.9'){
    validateInstalledRecentSearch(reports.recentSearch,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.recentSearch[key],reports.searchCompleteness[key])
    assertRecentSearchOutputBytes(reports.recentSearch,file=>read(evidenceRoot+file))
  }
  if(['1.2.31','1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlFieldOrder(reports.yamlFieldOrder,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlFieldOrder[key],reports.searchCompleteness[key])
    assertYamlFieldOrderOutputBytes(reports.yamlFieldOrder,file=>read(evidenceRoot+file))
  }
  if(['1.2.30','1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlFieldCopy(reports.tomlFieldCopy,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlFieldCopy[key],reports.searchCompleteness[key])
    assertTomlFieldCopyOutputBytes(reports.tomlFieldCopy,file=>read(evidenceRoot+file))
  }
  if(['1.2.29','1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlFieldCopy(reports.yamlFieldCopy,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlFieldCopy[key],reports.searchCompleteness[key])
    assertYamlFieldCopyOutputBytes(reports.yamlFieldCopy,file=>read(evidenceRoot+file))
  }
  if(['1.2.28','1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlOrder(reports.tomlOrder,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlOrder[key],reports.searchCompleteness[key])
    assertTomlOrderOutputBytes(reports.tomlOrder,file=>read(evidenceRoot+file))
  }
  if(['1.2.27','1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlOrder(reports.yamlOrder,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlOrder[key],reports.searchCompleteness[key])
    assertYamlOrderOutputBytes(reports.yamlOrder,file=>read(evidenceRoot+file))
  }
  if(['1.2.26','1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledListCopy(reports.listCopy,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.listCopy[key],reports.searchCompleteness[key])
    assertListCopyOutputBytes(reports.listCopy,file=>read(evidenceRoot+file))
  }
  if(['1.2.25','1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlItemValues(reports.tomlItemValues,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlItemValues[key],reports.searchCompleteness[key])
    assertTomlItemValuesOutputBytes(reports.tomlItemValues,file=>read(evidenceRoot+file))
  }
  if(['1.2.24','1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlArrays(reports.tomlArrays,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlArrays[key],reports.searchCompleteness[key])
    assertTomlArraysOutputBytes(reports.tomlArrays,file=>read(evidenceRoot+file))
  }
  if(['1.2.23','1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlSequences(reports.yamlSequences,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlSequences[key],reports.searchCompleteness[key])
    assertYamlSequencesOutputBytes(reports.yamlSequences,file=>read(evidenceRoot+file))
  }
  if(['1.2.22','1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlFields(reports.tomlFields,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlFields[key],reports.searchCompleteness[key])
    assertTomlFieldsOutputBytes(reports.tomlFields,file=>read(evidenceRoot+file))
  }
  if(['1.2.21','1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlFields(reports.yamlFields,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlFields[key],reports.searchCompleteness[key])
    assertYamlFieldsOutputBytes(reports.yamlFields,file=>read(evidenceRoot+file))
  }
  if(['1.2.20','1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlRename(reports.tomlRename,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlRename[key],reports.searchCompleteness[key])
    assertTomlRenameOutputBytes(reports.tomlRename,file=>read(evidenceRoot+file))
  }
  if(['1.2.19','1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlRename(reports.yamlRename,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlRename[key],reports.searchCompleteness[key])
    assertYamlRenameOutputBytes(reports.yamlRename,file=>read(evidenceRoot+file))
  }
  if(['1.2.18','1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledXmlCreate(reports.xmlCreate,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.xmlCreate[key],reports.searchCompleteness[key])
    assertXmlCreateOutputBytes(reports.xmlCreate,file=>read(evidenceRoot+file))
  }
  if(['1.2.17','1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledSavepoint(reports.savepoint,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.savepoint[key],reports.searchCompleteness[key])
    assertSavepointOutputBytes(reports.savepoint,file=>read(evidenceRoot+file))
  }
  if(['1.2.16','1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledXmlManage(reports.xmlManage,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.xmlManage[key],reports.searchCompleteness[key])
    assertXmlManageOutputBytes(reports.xmlManage,file=>read(evidenceRoot+file))
  }
  if(['1.2.15','1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledXmlDelete(reports.xmlDelete,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.xmlDelete[key],reports.searchCompleteness[key])
    assertXmlDeleteOutputBytes(reports.xmlDelete,file=>read(evidenceRoot+file))
  }
  if(['1.2.14','1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledXmlOrder(reports.xmlOrder,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.xmlOrder[key],reports.searchCompleteness[key])
    assertXmlOrderOutputBytes(reports.xmlOrder,file=>read(evidenceRoot+file))
  }
  if(['1.2.13','1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledXmlElement(reports.xmlElement,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.xmlElement[key],reports.searchCompleteness[key])
    assertXmlElementOutputBytes(reports.xmlElement,file=>read(evidenceRoot+file))
  }
  if(['1.2.12','1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledXmlText(reports.xmlText,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.xmlText[key],reports.searchCompleteness[key])
    assertXmlTextOutputBytes(reports.xmlText,file=>read(evidenceRoot+file))
  }
  if(['1.2.11','1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledXmlAttribute(reports.xmlAttribute,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.xmlAttribute[key],reports.searchCompleteness[key])
    assertXmlAttributeOutputBytes(reports.xmlAttribute,file=>read(evidenceRoot+file))
  }
  if(['1.2.10','1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledYamlValue(reports.yamlValue,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.yamlValue[key],reports.searchCompleteness[key])
    assertYamlValueOutputBytes(reports.yamlValue,file=>read(evidenceRoot+file))
  }
  if(['1.2.9','1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTomlValue(reports.tomlValue,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tomlValue[key],reports.searchCompleteness[key])
    assertTomlValueOutputBytes(reports.tomlValue,file=>read(evidenceRoot+file))
  }
  if(['1.2.8','1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledJsonNodeCopy(reports.jsonNode,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.jsonNode[key],reports.searchCompleteness[key])
    assertJsonNodeCopyOutputBytes(reports.jsonNode,file=>read(evidenceRoot+file))
  }
  if(['1.2.7','1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledJsonArray(reports.jsonArray,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.jsonArray[key],reports.searchCompleteness[key])
    assertJsonArrayOutputBytes(reports.jsonArray,file=>read(evidenceRoot+file))
  }
  if(['1.2.6','1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTableColumns(reports.tableColumns,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tableColumns[key],reports.searchCompleteness[key])
    assertTableColumnOutputBytes(reports.tableColumns,file=>read(evidenceRoot+file))
  }
  if(['1.2.5','1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTableRows(reports.tableRows,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tableRows[key],reports.searchCompleteness[key])
    assertTableRowOutputBytes(reports.tableRows,file=>read(evidenceRoot+file))
  }
  if(['1.2.4','1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTableFill(reports.tableFill,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tableFill[key],reports.searchCompleteness[key])
    assertTableFillOutputBytes(reports.tableFill,file=>read(evidenceRoot+file))
  }
  if(['1.2.3','1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledAnnotationBatch(reports.annotationBatch,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.annotationBatch[key],reports.searchCompleteness[key])
    assertAnnotationBatchOutputBytes(reports.annotationBatch,file=>read(evidenceRoot+file))
  }
  if(['1.2.2','1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledAnnotationHistory(reports.annotationHistory,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.annotationHistory[key],reports.searchCompleteness[key])
    assertAnnotationHistoryOutputBytes(reports.annotationHistory,file=>read(evidenceRoot+file))
  }
  if(['1.2.1','1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledReadingMove(reports.readingMove,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.readingMove[key],reports.searchCompleteness[key])
    assertReadingMoveOutputBytes(reports.readingMove,file=>read(evidenceRoot+file))
  }
  if(['1.1.37','1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledPdfResume(reports.pdfResume,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.pdfResume[key],reports.searchCompleteness[key])
    assertPdfResumeOutputBytes(reports.pdfResume,file=>read(evidenceRoot+file))
  }
  if (['1.1.36','1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    validateInstalledContextCommands(reports.contextCommands,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.contextCommands[key],reports.searchCompleteness[key])
    assertContextCommandOutputBytes(reports.contextCommands,file=>read(evidenceRoot+file))
  }
  if (['1.1.35','1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    validateInstalledAttachmentDrafts(reports.attachmentDrafts,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.attachmentDrafts[key],reports.searchCompleteness[key])
    assertAttachmentDraftOutputBytes(reports.attachmentDrafts,file=>read(evidenceRoot+file))
  }
  if(['1.1.34','1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledPortableChapters(reports.portableChapters,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.portableChapters[key],reports.searchCompleteness[key])
    assertPortableChapterOutputBytes(reports.portableChapters,file=>read(evidenceRoot+file))
  }
  if(['1.1.33','1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledCopyReading(reports.copyReading,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.copyReading[key],reports.searchCompleteness[key])
    assertCopyReadingOutputBytes(reports.copyReading,file=>read(evidenceRoot+file))
  }
  if(['1.1.32','1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledRestoreContinuity(reports.restoreContinuity,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.restoreContinuity[key],reports.searchCompleteness[key])
    assertRestoreContinuityOutputBytes(reports.restoreContinuity,file=>read(evidenceRoot+file))
  }
  if(['1.1.31','1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledWorkbookEntry(reports.workbookEntry,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.workbookEntry[key],reports.searchCompleteness[key])
    assertWorkbookEntryOutputBytes(reports.workbookEntry,file=>read(evidenceRoot+file))
  }
  if(['1.1.30','1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledTableValidation(reports.tableValidation,manifest)
    for(const key of ['harnessSourceCommit','executableSha256'])assert.equal(reports.tableValidation[key],reports.searchCompleteness[key])
    assertTableValidationOutputBytes(reports.tableValidation,file=>read(evidenceRoot+file))
  }
  if(['1.1.29','1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledPdfContinuity(reports.pdfContinuity,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.pdfContinuity[key],reports.searchCompleteness[key])
    assertPdfContinuityOutputBytes(reports.pdfContinuity,file=>read(evidenceRoot+file))
  }
  if(['1.1.28','1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledReferenceRepair(reports.referenceRepair,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.referenceRepair[key],reports.searchCompleteness[key])
    assertReferenceRepairOutputBytes(reports.referenceRepair,file=>read(evidenceRoot+file))
  }
  if(['1.1.27','1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledCollectionReuse(reports.collectionReuse,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.collectionReuse[key],reports.searchCompleteness[key])
    assertCollectionReuseOutputBytes(reports.collectionReuse,file=>read(evidenceRoot+file))
  }
  if(['1.1.26','1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledStructuredHistory(reports.structuredHistory,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.structuredHistory[key],reports.searchCompleteness[key])
    assertStructuredHistoryOutputBytes(reports.structuredHistory,file=>read(evidenceRoot+file))
  }
  if(['1.1.25','1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledFindReplace(reports.findReplace,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.findReplace[key],reports.searchCompleteness[key])
    assertFindReplaceOutputBytes(reports.findReplace,file=>read(evidenceRoot+file))
  }
  if(['1.1.24','1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledChapters(reports.chapters,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.chapters[key],reports.searchCompleteness[key])
    assertChapterOutputBytes(reports.chapters,file=>read(evidenceRoot+file))
  }
  if(['1.1.23','1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledAttachments(reports.attachments,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.attachments[key],reports.searchCompleteness[key])
    assertAttachmentOutputBytes(reports.attachments,file=>read(evidenceRoot+file))
  }
  if(['1.1.22','1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledFileHistory(reports.fileOperationHistory,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.fileOperationHistory[key],reports.searchCompleteness[key])
    assertFileHistoryOutputBytes(reports.fileOperationHistory,file=>read(evidenceRoot+file))
  }
  if(['1.1.21','1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledCrossCopy(reports.crossLibraryCopy,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.crossLibraryCopy[key],reports.searchCompleteness[key])
    assertCrossCopyOutputBytes(reports.crossLibraryCopy,file=>read(evidenceRoot+file))
  }
  if(['1.1.20','1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledStructured(reports.structuredEditing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.structuredEditing[key],reports.searchCompleteness[key])
    assertStructuredOutputBytes(reports.structuredEditing,file=>read(evidenceRoot+file))
  }
  if(['1.1.19','1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledOrganizing(reports.organizing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.organizing[key],reports.searchCompleteness[key])
    assertOrganizingOutputBytes(reports.organizing,file=>read(evidenceRoot+file))
  }
  if(['1.1.18','1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledPptxEditing(reports.pptxEditing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.pptxEditing[key],reports.searchCompleteness[key])
    assertPptxOutputBytes(reports.pptxEditing,file=>read(evidenceRoot+file))
  }
  if(['1.1.17','1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledDocxEditing(reports.docxEditing,manifest)
    for(const key of ['executableSha256','harnessSourceCommit'])assert.equal(reports.docxEditing[key],reports.searchCompleteness[key])
    assertDocxOutputBytes(reports.docxEditing,file=>read(evidenceRoot+file))
  }
  const { workspace, routes, search, version, stability } = reports
  if(['1.1.14','1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)){
    validateInstalledWritingDelivery(reports.writingDelivery,manifest)
    assert.equal(reports.writingDelivery.executableSha256,reports.searchCompleteness.executableSha256)
    assert.equal(reports.writingDelivery.harnessSourceCommit,reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.13','1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    validateInstalledPdfReading(reports.pdfReading, manifest)
    assert.equal(reports.pdfReading.executableSha256, reports.searchCompleteness.executableSha256)
    assert.equal(reports.pdfReading.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.12','1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    validateInstalledContentBackup(reports.contentBackup, manifest)
    assert.equal(reports.contentBackup.executableSha256, reports.searchCompleteness.executableSha256)
    assert.equal(reports.contentBackup.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.11','1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    validateInstalledGraphExploration(reports.graphExploration, manifest)
    assert.equal(reports.graphExploration.executableSha256, reports.searchCompleteness.executableSha256)
    assert.equal(reports.graphExploration.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    validateInstalledTagCollections(reports.tagCollections, manifest)
    assert.equal(reports.tagCollections.executableSha256, reports.searchCompleteness.executableSha256)
    assert.equal(reports.tagCollections.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit)
  }
  if (['1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    validateInstalledWorkSession(reports.workSession, manifest)
    assert.equal(reports.workSession.executableSha256, reports.searchCompleteness.executableSha256, 'all current/historical tasks must use the same installed executable')
    assert.equal(reports.workSession.harnessSourceCommit, reports.searchCompleteness.harnessSourceCommit, 'all current/historical tasks must use the same review driver')
  }
  if (['1.1.8','1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    validateInstalledSearchCompleteness(reports.searchCompleteness, reports.searchBaseline, reports.searchUser, reports.searchOffice, manifest)
  }
  if (['1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
    const report = reports.moveContinuity
    assert.equal(report.status, 'passed'); assert.equal(report.appVersion, manifest.appVersion)
    assert.equal(report.sourceCommit, manifest.sourceCommit)
    assert.equal(report.installerSha256, manifest.artifacts.find(item => item.target === 'nsis').sha256)
    assert.equal(report.evidenceLevel, 'installed-tauri-ipc-and-disk'); assert.equal(report.sourceUserContentIncluded, false)
    assert.deepEqual(report.checks.map(check => [check.id, check.status]), moveContinuityChecks.map(id => [id, 'passed']))
  }
  if (['1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
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
  if (['1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
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
  if (['1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
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
  if (['1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
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
  if (['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
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
  if (['1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion)) {
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
