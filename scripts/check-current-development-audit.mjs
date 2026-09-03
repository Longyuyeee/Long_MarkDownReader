import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import './check-community-updater-contract.mjs'
import './check-command-strip-layout.mjs'
import './check-v106-managed-updater-lifecycle.mjs'
import './check-v107-managed-updater-lifecycle.mjs'
import './check-v108-managed-updater-lifecycle.mjs'
import './check-v109-managed-updater-lifecycle.mjs'
import './check-v110-managed-updater-lifecycle.mjs'
import './check-v111-managed-updater-lifecycle.mjs'
import './check-v112-managed-updater-lifecycle.mjs'
import './check-v113-managed-updater-lifecycle.mjs'
import './check-v114-managed-updater-lifecycle.mjs'
import './check-v116-managed-updater-lifecycle.mjs'
import './check-post-v116-m5-0-v1017-scope-selection.mjs'
import './check-post-v116-m5-1-odp-producer-selection.mjs'
import './check-post-v116-m5-2-odp-simple-slide-copy.mjs'
import './check-post-v116-m5-3-odp-workspace.mjs'
import './check-post-v116-m5-4-v1017-release-readiness.mjs'
import './check-post-v116-m5-5-v1017-candidate-packaging.mjs'
import './check-post-v116-m5-6-v1017-hosted-installer-lifecycle.mjs'
import './check-post-v116-m5-7-v1017-final-release-readiness.mjs'
import './check-post-v116-m5-8-v1017-published-release.mjs'
import './check-v117-managed-updater-lifecycle.mjs'
import './check-v118-managed-updater-lifecycle.mjs'
import './check-v119-managed-updater-lifecycle.mjs'
import './check-v121-managed-updater-lifecycle.mjs'
import './check-post-v119-m8-5-graph-visual-performance-polish.mjs'
import './check-post-v119-m8-5-graph-visual-performance-evidence.mjs'
execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/check-post-v120-graph-zoom-detail-controls.mjs'], { stdio: 'inherit' })
import './check-post-v117-m6-0-v1018-scope-selection.mjs'
import './check-post-v117-m6-1-graph-fullscreen.mjs'
import './check-post-v117-m6-2-v1018-next-slice-selection.mjs'
import './check-post-v117-m6-3-v1018-release-readiness.mjs'
import './check-post-v117-m6-4-v1018-candidate-packaging.mjs'
import './check-post-v117-m6-5-v1018-hosted-installer-lifecycle.mjs'
import './check-post-v117-m6-6-v1018-final-release-readiness.mjs'
import './check-post-v117-m6-7-v1018-published-release.mjs'
import './check-post-v118-m7-0-v1019-scope-selection.mjs'
import './check-post-v118-m7-1-local-json-schema-feasibility.mjs'
import './check-post-v118-m7-2-local-json-schema-product.mjs'
import './check-post-v118-m7-3-v1019-release-readiness.mjs'
import './check-post-v118-m7-4-v1019-candidate-packaging.mjs'
import './check-code-file-creation.mjs'
import './check-cf1-code-file-creation-audit.mjs'
import './check-ux51-external-window-lifecycle.mjs'
import './check-v115-interaction-polish-audit.mjs'
import './check-v115-global-tooltip-policy.mjs'
import './check-v115-overlay-bounds.mjs'
import './check-post-v115-m1cc-ods-formula-style.mjs'
import './check-post-v115-m1cd-ods-style-edit.mjs'
import './check-post-v115-m1d-selection.mjs'
import './check-post-v115-m1da-large-json.mjs'
import './check-post-v115-m1db-video-tools.mjs'
import './check-post-v115-m1dc-selection.mjs'
import './check-post-v115-m1dc1-subtitle-playback.mjs'
import './check-post-v115-m1-closure.mjs'
import './check-development-version-identity.mjs'
execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/check-post-v115-m3b4-curved-parallel-relations-static-path-labels.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/check-post-v115-m3b5-selected-path-direction-motion-reduced-motion.mjs'], { stdio: 'inherit' })
import './check-post-v115-m3b6-navigation-camera-selection.mjs'
execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/check-post-v115-m3b7-fit-selection-reduced-motion-focus.mjs'], { stdio: 'inherit' })
import './check-post-v115-m3b8-remaining-navigation-selection.mjs'
execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/check-post-v115-m3b9-bounded-semantic-minimap.mjs'], { stdio: 'inherit' })
import './check-post-v115-m3b10-remaining-professional-visual-selection.mjs'
execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/check-post-v115-m3b11-restrained-node-status-rings.mjs'], { stdio: 'inherit' })
import './check-post-v115-m3b12-professional-visual-system-exit.mjs'
import './check-post-v115-m3c0-large-graph-performance-baseline.mjs'
import './check-post-v115-m3c1-settled-dirty-frame-and-lifecycle-loop.mjs'
import './check-post-v115-m3c2-large-graph-main-thread-phase-profiling-selection.mjs'
import './check-post-v115-m3c3-worker-backed-bounded-force-layout-kernel.mjs'
import './check-post-v115-m3c4-large-graph-performance-exit-audit.mjs'
import './check-post-v115-m4f4-v1016-final-release-readiness.mjs'
import './check-post-v115-m4f5-v1016-published-release.mjs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const matrix = JSON.parse(fs.readFileSync('shared/release-capability-matrix.json', 'utf8'))
const policy = JSON.parse(fs.readFileSync('shared/v1-community-release-policy.json', 'utf8'))
const development = JSON.parse(fs.readFileSync('shared/development-version-policy.json', 'utf8'))
const audit = fs.readFileSync('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md', 'utf8')
const counts = matrix.formats.reduce((result, item) => {
  result[item.readiness] = (result[item.readiness] ?? 0) + 1
  return result
}, {})
const required = [
  ['43 类格式', matrix.formats.length === 43],
  ['30 类为已验证', counts.verified === 30],
  ['7 类为有限能力', counts['verified-with-limitations'] === 7],
  ['6 类依赖外部程序', counts['external-dependency'] === 6],
  ['11 套发布能力配置', matrix.profiles.length === 11],
  [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === '1.0.22'],
  [`当前运行时版本：\`${development.runtimeBaseVersion}\``, matrix.appVersion === pkg.version && policy.appVersion === pkg.version],
  [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === '1.0.21' && development.publicTag === `v${development.publicVersion}`],
  ['P0、UI-1、UI-2、UI-3 与 UI-4 均已完成', true],
  ['当前阶段：**M8-12 v1.0.20 → v1.0.21 官方应用内更新观察**', policy.currentStatus === 'v1.0.21-community-release-published' && policy.patchValidation?.managedUpdaterUpgradePath === '1.0.20-to-1.0.21-passed'],
]

for (const [token, condition] of required) {
  if (!condition) throw new Error(`[current-development-audit] source-of-truth no longer supports: ${token}`)
  if (!audit.includes(token)) throw new Error(`[current-development-audit] audit is missing: ${token}`)
}

for (const section of ['## 1. 审计结论', '## 2. 需求对齐', '## 3. 当前开发状态', '## 4. 发布边界', '## 5. 接手后的顺序']) {
  if (!audit.includes(section)) throw new Error(`[current-development-audit] audit is missing section: ${section}`)
}

console.log(`Current development audit passed: v${development.publicVersion} is public and v${development.developmentTargetVersion} is the next bounded development target.`)
await import('./check-external-mermaid-workspace.mjs')
await import('./check-external-opml-workspace.mjs')
await import('./check-default-app-candidate-workflow.mjs')
await import('./check-default-app-uninstall-recovery.mjs')
await import('./check-default-app-installed-lifecycle-harness.mjs')
await import('./check-ea5c-external-open-closure.mjs')
await import('./check-p1a3b-image-editor-controls.mjs')
await import('./check-p1a3b-image-editor-audit.mjs')
await import('./check-p1b1-pdf-safety-audit.mjs')
await import('./check-p1b2a1-pdf-form-inspector.mjs')
await import('./check-p1b2a2-pdf-form-panel.mjs')
await import('./check-p1b2b0-pdf-registry-reconciliation.mjs')
await import('./check-p1b2b1-pdf-text-form-copy.mjs')
await import('./check-p1b2b2-pdf-form-copy-workspace.mjs')
await import('./check-p1b2b3-pdf-unicode-form-copy.mjs')
await import('./check-p1b2b4-pdf-checkbox-copy.mjs')
await import('./check-p1b2b5-pdf-radio-copy.mjs')
await import('./check-p1b2b6-pdf-choice-copy.mjs')
await import('./check-p1b3a-pdf-redaction-safety-audit.mjs')
await import('./check-p1b3b-pdf-redaction-backend.mjs')
await import('./check-p1b3c-pdf-redaction-workspace.mjs')
await import('./check-p1b3d-pdf-redaction-evidence.mjs')
await import('./check-p1b4a-pdf-watermark-safety-audit.mjs')
await import('./check-p1b4b-pdf-watermark-backend.mjs')
await import('./check-p1b4c-pdf-watermark-workspace.mjs')
await import('./check-p1b4d-pdf-watermark-evidence.mjs')
await import('./check-p1b5a-pdf-metadata-safety-audit.mjs')
await import('./check-p1b5b-pdf-metadata-backend.mjs')
await import('./check-p1b5c-pdf-metadata-workspace.mjs')
await import('./check-p1b5d-pdf-metadata-evidence.mjs')
await import('./check-p1-final-capability-closure.mjs')
await import('./check-p2a-pdf-capability-alignment.mjs')
await import('./check-p2b-image-color-adjustments.mjs')
await import('./check-p2b-image-color-adjustments-evidence.mjs')
await import('./check-p2c-image-navigation.mjs')
await import('./check-p2c-image-navigation-evidence.mjs')
