import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
execFileSync(process.execPath, ['--test', 'scripts/test-v119-installed-release.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v118-native-search-audit.mjs','scripts/test-search-feedback-contract.mjs','scripts/test-v118-native-search-evidence.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v118-native-user.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v118-native-office.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v118-installed-release.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-community-publication.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-installed-search-fixture-path.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-file-move-protection.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-local-image-continuity.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-local-markdown-links.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-document-tooltip-content.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v115-release-contract.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v116-release-contract.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v117-release-contract.mjs', 'scripts/test-history-read-coordination.mjs', 'scripts/test-v117-published-handoff.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-installed-index-readiness.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-work-sessions.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-portable-work-session.mjs', 'scripts/test-work-session-transfer.mjs', 'scripts/test-work-session-context.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v119-native-session.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v119-native-session-receipt.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-markdown-save-notifications.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-library-tree-ancestors.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--experimental-strip-types', '--test', 'scripts/test-search-query.mjs', 'scripts/test-window-draft-snapshot.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-note-template-transfer.mjs', 'scripts/test-history-diff.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v126-version-transition.mjs'], { stdio: 'inherit' })
if (JSON.parse(fs.readFileSync('package.json', 'utf8')).version === '1.1.0') {
  execFileSync(process.execPath, ['--test', 'scripts/test-v1-1-0-version-identity.mjs'], { stdio: 'inherit' })
}
execFileSync(process.execPath, ['--experimental-strip-types', '--test', 'scripts/test-inline-tags.mjs', 'scripts/test-note-link-targets.mjs', 'scripts/test-capture-destination.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-installed-deadline.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-markdown-idle-performance.mjs', 'scripts/test-opener-acl.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-search-source-path.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-search-highlight.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-search-result-groups.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-search-document-preview.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-search-return.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-search-location.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-source-excerpt.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-window-close-lifecycle.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-library-recovery.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-text-save-lifecycle.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v122-version-transition.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v124-installer-receipt.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v124-version-transition.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v123-version-transition.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v123-candidate-lifecycle.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v123-installer-receipt.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v122-candidate-lifecycle.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-installed-release-runtime.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-version-identity.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-version-audit-fixture.mjs'], { stdio: 'inherit' })
import './check-v123-fault-observation.mjs'
execFileSync(process.execPath, ['--test', 'scripts/test-v122-installer-receipt.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--experimental-strip-types', '--test', 'scripts/test-search-recovery.mjs', 'scripts/test-search-pages.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-search-result-layout.mjs'], { stdio: 'inherit' })
import './check-community-updater-contract.mjs'
import './check-v122-managed-updater-lifecycle.mjs'
import './check-v123-managed-updater-lifecycle.mjs'
execFileSync(process.execPath, ['--test', 'scripts/test-v122-installed-search-workflow.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-installed-text-save-feedback.mjs'], { stdio: 'inherit' })
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
execFileSync(process.execPath, ['--test', 'scripts/test-v121-updater-status.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-community-release-observation.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v121-updater-import.mjs'], { stdio: 'inherit' })
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
const v122Published = policy.appVersion === '1.0.22' && policy.gates?.githubReleasePublished === true
const v123Candidate = policy.appVersion === '1.0.23' && policy.gates?.githubReleasePublished === false && development.publicVersion === '1.0.22'
const v123Published = policy.appVersion === '1.0.23' && policy.gates?.githubReleasePublished === true && development.publicVersion === '1.0.23'
const v126Published = policy.appVersion === '1.0.26' && policy.gates?.githubReleasePublished === true && development.publicVersion === '1.0.26'
const v126Candidate = policy.appVersion === '1.0.26' && policy.gates?.githubReleasePublished === false && development.publicVersion === '1.0.25'
const v125Published = policy.appVersion === '1.0.25' && policy.gates?.githubReleasePublished === true && development.publicVersion === '1.0.25'
const v125Candidate = policy.appVersion === '1.0.25' && policy.gates?.githubReleasePublished === false && development.publicVersion === '1.0.24'
const v124Published = policy.appVersion === '1.0.24' && policy.gates?.githubReleasePublished === true && development.publicVersion === '1.0.24'
const v124Ready = policy.appVersion === '1.0.24' && policy.releaseCandidate === true && policy.gates?.githubReleasePublished === false
const v124Candidate = policy.appVersion === '1.0.24' && policy.gates?.githubReleasePublished === false && development.publicVersion === '1.0.23'
const afterV122 = v122Published || v123Candidate || v123Published
const v123Ready = v123Candidate && policy.currentStatus === 'v1.0.23-community-release-ready-to-publish'
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
  [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (v126Published ? '1.0.27' : v126Candidate ? '1.0.26' : v125Published ? '1.0.26' : v125Candidate ? '1.0.25' : v124Published ? '1.0.25' : v124Candidate || v123Published ? '1.0.24' : afterV122 ? '1.0.23' : '1.0.22')],
  [`当前运行时版本：\`${development.runtimeBaseVersion}\``, matrix.appVersion === pkg.version && policy.appVersion === pkg.version],
  [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (v126Published ? '1.0.26' : v126Candidate ? '1.0.25' : v125Published ? '1.0.25' : v125Candidate ? '1.0.24' : v124Published ? '1.0.24' : v124Candidate || v123Published ? '1.0.23' : afterV122 ? '1.0.22' : '1.0.21') && development.publicTag === `v${development.publicVersion}`],
  ['P0、UI-1、UI-2、UI-3 与 UI-4 均已完成', true],
[v126Published ? '当前阶段：**v1.0.26 已发布**' : v126Candidate ? '当前阶段：**v1.0.26 参考写作闭环候选**' : v125Published ? '当前阶段：**v1.0.25 已发布**' : v125Candidate ? '当前阶段：**v1.0.25 搜索与参考阅读候选**' : v124Published ? '当前阶段：**v1.0.24 已发布（官方更新观察待完成）**' : v124Ready ? '当前阶段：**v1.0.24 安装与稳定性验收完成（待公开发布）**' : v124Candidate ? '当前阶段：**v1.0.24 稳定性候选（发布验收中）**' : v123Published ? '当前阶段：**v1.0.23 已发布（官方更新观察待完成）**' : v123Ready ? '当前阶段：**v1.0.23 安装与视觉验收完成（待公开发布）**' : v123Candidate ? '当前阶段：**v1.0.23 版本身份修复候选（安装态待验证）**' : v122Published ? '当前阶段：**v1.0.23 版本身份修复（页面与安装态待验证）**' : '当前阶段：**v1.0.22 搜索补丁候选安装验收准备**', development.currentStage === (v126Published ? 'M8-27-v1.0.26-published' : v126Candidate ? 'M8-26-v1.0.26-version-candidate' : v125Published ? 'M8-25-v1.0.25-published' : v125Candidate ? 'M8-24-v1.0.25-version-candidate' : v124Published ? 'M8-23-v1.0.24-published-update-pending' : v124Ready ? 'M8-22-v1.0.24-release-ready' : v124Candidate ? 'M8-21-v1.0.24-version-candidate' : v123Published ? 'M8-20-v1.0.23-published-update-pending' : v123Ready ? 'M8-19-v1.0.23-release-ready' : v123Candidate ? 'M8-18-v1.0.23-version-candidate' : v122Published ? 'M8-17-v1.0.23-version-identity' : 'M8-14-v1.0.22-search-candidate') && development.activeSlice?.id === (v126Published || v126Candidate ? 'v1.0.26-reference-writing-loop' : v125Published || v125Candidate ? 'v1.0.25-search-and-reference' : v124Published || v124Candidate ? 'v1.0.24-library-recovery-and-close-safety' : afterV122 ? 'v1.0.23-version-identity' : 'v1.0.22-search-scope-freeze') && fs.existsSync(development.activeSlice.document)],
  ['M8 更新观察已收口', JSON.parse(fs.readFileSync('shared/v121-managed-updater-lifecycle-policy.json', 'utf8')).status === 'hosted-managed-update-passed'],
]

// The approved 1.1.0 minor transition supersedes the old patch-only roadmap.
// Retain all capability counts and historical acceptance checks above.
if (['1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9'].includes(pkg.version)) {
  const published = policy.gates?.githubReleasePublished === true
  const version = pkg.version
  const patch = Number(version.split('.')[2])
  const next = '1.1.' + (patch + 1)
  const previous = patch === 0 ? '1.0.26' : '1.1.' + (patch - 1)
  const slices = ['v1.1.0-ui-and-workflow', 'v1.1.1-library-experience', 'v1.1.2-file-management', 'v1.1.3-foundation-workflow', 'v1.1.4-foundation-workflow', 'v1.1.5-foundation-hardening', 'v1.1.6-move-continuity', 'v1.1.7-save-history', 'v1.1.8-search-completeness', 'v1.1.9-work-session-continuity']
  const stage = 'M8-' + (28 + patch * 2 + Number(published)) + '-v' + version + (published ? '-published' : '-version-candidate')
  required[5] = ['当前开发目标：' + '\x60' + development.developmentTargetVersion + '\x60', development.developmentTargetVersion === (published ? next : version)]
  required[7] = ['当前公开版本：' + '\x60' + development.publicVersion + '\x60', development.publicVersion === (published ? version : previous) && development.publicTag === 'v' + development.publicVersion]
  const names = ['界面与工作流升级', '资料库体验升级', '文件整理与侧栏精简', '基础功能深化', '基础功能深化', '安全导入与搜索一致性', '移动、改名与链接接续', '保存与历史深化', '搜索完整性', '工作现场']
  required[9] = ['当前阶段：**v' + version + (published ? ' 已发布**' : ' ' + names[patch] + '候选**'), development.currentStage === stage && development.activeSlice?.id === slices[patch] && fs.existsSync(development.activeSlice.document)]
  if (version === '1.1.2' && development.activeSlice?.id === 'v1.1.3-custom-note-templates') {
    required[9] = ['当前阶段：**v1.1.3 自定义模板开发**', published && development.releaseCandidate === false
      && development.currentStage === 'M8-34-v1.1.3-note-templates' && fs.existsSync(development.activeSlice.document)]
  }
  if (version === '1.1.7' && development.activeSlice?.id === 'v1.1.8-search-completeness') {
    required[9] = ['当前阶段：**v1.1.8 搜索完整性开发**', published && development.releaseCandidate === false
      && development.currentStage === 'M8-44-v1.1.8-search-completeness' && fs.existsSync(development.activeSlice.document)]
  }
  if (version === '1.1.8' && development.activeSlice?.id === 'v1.1.9-work-session-continuity') {
    required[9] = ['当前阶段：**v1.1.9 工作现场开发**', published && development.releaseCandidate === false
      && development.currentStage === 'M8-46-v1.1.9-work-session-continuity' && fs.existsSync(development.activeSlice.document)]
  }
}

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

execFileSync(process.execPath, ['--test', 'scripts/test-v117-release-contract.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-history-read-coordination.mjs'], { stdio: 'inherit' })
