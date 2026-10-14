import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { validateInstalledVersionObservations } from './installed-version-identity.mjs'

export function assertInstalledReleaseRuntime(manifest, read = file => fs.readFileSync(file)) {
  const runtime = manifest.runtimeSmoke
  assert.equal(runtime.status, 'passed-installed-tauri-webview2')
  assert.equal(runtime.checksPassed, 18)
  assert.equal(runtime.routesPassed, 11)
  assert.ok(['1.0.22', '1.0.23', '1.0.24', '1.0.25', '1.0.26', '1.1.0', '1.1.1'].includes(manifest.appVersion))
  const versionCandidate = manifest.appVersion !== '1.0.22'
  const evidenceRoot = manifest.appVersion === '1.1.1' ? 'docs/evidence/v1-1-1-candidate-lifecycle/' : manifest.appVersion === '1.1.0' ? 'docs/evidence/v1-1-0-candidate-lifecycle/' : manifest.appVersion === '1.0.26' ? 'docs/evidence/v126-candidate-lifecycle/' : manifest.appVersion === '1.0.25' ? 'docs/evidence/v125-candidate-lifecycle/' : manifest.appVersion === '1.0.24' ? 'docs/evidence/v124-candidate-lifecycle/' : versionCandidate ? 'docs/evidence/v123-installed-visual-review/' : 'docs/evidence/v122-installed-search/'
  const reports = Object.fromEntries(Object.entries(runtime.reports).map(([name, item]) => {
    assert.equal(item.path, evidenceRoot + path.posix.basename(item.path))
    const bytes = read(item.path)
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, `${name} raw evidence changed`)
    return [name, JSON.parse(bytes)]
  }))
  const { workspace, routes, search, version, stability } = reports
  if (manifest.appVersion === '1.1.1') {
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
  if (['1.1.0', '1.1.1'].includes(manifest.appVersion)) {
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
