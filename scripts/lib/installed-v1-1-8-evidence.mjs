import assert from 'node:assert/strict'
import { nativeBaselineChecks } from './v118-native-search-evidence.mjs'
import { nativeUserChecks } from './v118-native-user-evidence.mjs'
import { nativeOfficeChecks } from './v118-native-office-input.mjs'
import { officeFixtureSpecs, officePathKey } from './v118-native-office-fixture.mjs'

export const searchCompletenessChecks = [...nativeBaselineChecks, ...nativeUserChecks, ...nativeOfficeChecks]

export function validateInstalledSearchCompleteness(summary, baseline, user, office, manifest) {
  const installer = manifest.artifacts.find(item => item.target === 'nsis')?.sha256
  assert.ok(['1.1.8','1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6'].includes(manifest.appVersion))
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/)
  assert.match(installer || '', /^[a-f0-9]{64}$/)
  assert.match(summary.harnessSourceCommit, /^[a-f0-9]{40}$/)
  assert.match(summary.executableSha256, /^[a-f0-9]{64}$/)
  for (const report of [summary, baseline, user, office]) {
    assert.equal(report.status, 'passed'); assert.equal(report.appVersion, manifest.appVersion)
    assert.equal(report.sourceCommit, manifest.sourceCommit); assert.equal(report.installerSha256, installer)
    assert.equal(report.harnessSourceCommit, summary.harnessSourceCommit)
    assert.equal(report.executableSha256, summary.executableSha256)
    assert.equal(report.sourceUserContentIncluded, false)
    assert.equal(report.desktopInputUsed, false)
  }
  assert.equal(summary.evidenceLevel, 'installed-tauri-ipc-and-disk')
  assert.equal(summary.finalDraftAction, 'explicit-user-save-after-all-preservation-checks')
  assert.equal(summary.temporaryDirectoryIdentity.samePhysicalDirectory, true)
  assert.ok(summary.temporaryDirectoryIdentity.input && summary.temporaryDirectoryIdentity.canonical)
  assert.deepEqual(summary.checks.map(check => [check.id, check.status]), searchCompletenessChecks.map(id => [id, 'passed']))
  for (const [report, phase, checks, level] of [
    [baseline, 'baseline', nativeBaselineChecks, 'installed-tauri-ipc-and-disk'],
    [user, 'user', nativeUserChecks, 'installed-webview-input-events-and-disk'],
    [office, 'office', nativeOfficeChecks, 'installed-webview-input-events-and-disk'],
  ]) {
    assert.equal(report.installed, true); assert.equal(report.phase, phase)
    assert.equal(report.productCommit, manifest.sourceCommit)
    assert.equal(report.harnessCommit, summary.harnessSourceCommit)
    assert.equal(report.runtimeBaseVersion, manifest.appVersion); assert.equal(report.evidenceLevel, level)
    assert.deepEqual(report.checks, checks); assert.equal(report.uiObservation.errorOverlay, false)
  }
  assert.equal(baseline.generatedFixture.unregisteredEntries, 21050)
  assert.equal(baseline.expectedGroups.length, 244)
  assert.equal(new Set(baseline.expectedGroups.map(group => officePathKey(group.path))).size, 244)
  const pdf = baseline.expectedGroups.find(group => group.path.endsWith('/多批注.pdf'))
  assert.equal(pdf?.matches.filter(match => match.matchKind === 'annotation' && match.page === 1 && match.annotationId).length, 5)
  assert.ok(baseline.samples[0].workCalls > 1 && baseline.samples[0].indexed === false)
  assert.equal(baseline.samples[0].initialExaminedSources, 0)
  assert.equal(baseline.samples.at(-1).indexed, true)
  assert.ok(baseline.calls.some(call => call.window === 'quick-note' && call.command === 'search_knowledge_page' && call.ok))
  assert.ok(baseline.calls.some(call => call.window === 'quick-note' && call.command === 'search_knowledge_page' && call.code === 'expired'))
  for (const report of [user, office]) {
    assert.equal(report.nativeBridgeMocked, false); assert.deepEqual(report.runtimeErrors, [])
    assert.ok(report.inputTrace.length > 0 && report.inputTrace.every(event => event.trusted === true))
    for (const type of ['click', 'keydown', 'input']) assert.ok(report.inputTrace.some(event => event.type === type))
    for (const file of report.sourceFiles) { assert.match(file.before, /^[a-f0-9]{64}$/); assert.equal(file.after, file.before) }
  }
  assert.equal(user.initialFiles, 80); assert.equal(user.refreshFiles, 80)
  assert.match(user.expiryText, /搜索现场已变化或过期/)
  assert.deepEqual(user.footerRecovery, { label: '重新搜索', visibleWithoutRecoveryScroll: true, retainedFiles: 80 })
  assert.deepEqual(user.pdf, { annotationId: '批注-3', page: 1, comment: '预算位置3' })
  assert.deepEqual(user.sourceFiles.map(file => file.name).sort(), ['zz-项目预算.md', 'a-0001-记录.md', 'a-0000-记录.md', '多批注.pdf', '多批注.pdf.annotations.json'].sort())
  assert.match(user.draftContentSha256, /^[a-f0-9]{64}$/); assert.equal(user.draftChecks.length, 10)
  for (const checkpoint of user.draftChecks) { assert.equal(checkpoint.dirty, true); assert.equal(checkpoint.contentSha256, user.draftContentSha256) }
  assert.deepEqual(office.sourceFiles.map(file => [file.name, file.source, file.before, file.after]), officeFixtureSpecs.map(file => [file.name, file.source, file.sha256, file.sha256]))
  const { docx, pptxObject, pptxNotes, workbook } = office.observations
  assert.equal(docx.visible, true); assert.match(docx.targetText, /After explicit page break\./); assert.ok(docx.locator)
  assert.equal(pptxObject.locatorKind, 'pptx-object'); assert.equal(pptxObject.locator, pptxObject.objectId)
  assert.match(pptxObject.text, /Search and notes evidence/)
  assert.equal(pptxNotes.slide, '2'); assert.equal(pptxNotes.activeSlide, 2); assert.equal(pptxNotes.matchKind, 'notes')
  assert.equal(officePathKey(pptxObject.path), officePathKey(pptxNotes.path))
  assert.match(pptxNotes.notes, /LibreOffice image relationship evidence\./)
  assert.notEqual(pptxNotes.locatorToken, pptxObject.locatorToken)
  assert.deepEqual(workbook.map(item => item.activeSheet), ['Inventory', 'Details'])
  assert.equal(officePathKey(workbook[0].path), officePathKey(workbook[1].path))
  assert.notEqual(workbook[0].locatorToken, workbook[1].locatorToken)
  assert.deepEqual(workbook.map(item => item.matchingFiles), [1, 11]); assert.equal(workbook[1].otherTitleMatches, 10)
}
