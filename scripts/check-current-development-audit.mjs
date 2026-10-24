import fs from 'node:fs'
// Current release evidence is checked alongside every retained predecessor.
import { execFileSync } from 'node:child_process'
execFileSync(process.execPath,['--test','scripts/test-v1128-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--experimental-strip-types','--test','scripts/test-v1127-collection-transfer.mjs','scripts/test-v1127-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--test','scripts/test-v1126-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--experimental-strip-types','--test','scripts/test-v1125-find-replace.mjs','scripts/test-v1125-find-adapter.mjs','scripts/test-v1125-shortcut-lifecycle.mjs','scripts/test-v1125-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--experimental-strip-types','--test','scripts/test-v1124-markdown-sections.mjs','scripts/test-v1124-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--test','scripts/test-v1123-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--test','scripts/test-v1122-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--experimental-strip-types','--test','scripts/test-v1120-session.mjs','scripts/test-v1120-installed-release.mjs','scripts/test-v1121-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--test','scripts/test-v1119-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--test','scripts/test-v1118-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--test','scripts/test-v1117-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--test','scripts/test-workbook-clipboard.mjs','scripts/test-v1116-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--test','scripts/test-table-editing.mjs','scripts/test-v1115-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath,['--test','scripts/test-v1114-installed-release.mjs'],{stdio:'inherit'})
execFileSync(process.execPath, ['--experimental-strip-types', '--test', 'scripts/test-content-backup-ui-state.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v1112-installed-release.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v1111-installed-release.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--experimental-strip-types', '--test', 'scripts/test-graph-refresh.mjs', 'scripts/test-graph-topology.mjs', 'scripts/test-graph-labels.mjs', 'scripts/test-v1111-graph-search-fixture.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-installed-management-fixture.mjs', 'scripts/test-observed-native-command.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v119-installed-release.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v1110-installed-release.mjs'], { stdio: 'inherit' })
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
execFileSync(process.execPath, ['--experimental-strip-types', '--test', 'scripts/test-search-recovery.mjs', 'scripts/test-search-pages.mjs', 'scripts/test-v1110-collection-pages.mjs', 'scripts/test-v1110-tag-catalog.mjs'], { stdio: 'inherit' })
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
execFileSync(process.execPath, ['--test', 'scripts/test-pdf-reading-note.mjs'], { stdio: 'inherit' })
execFileSync(process.execPath, ['--test', 'scripts/test-v1113-installed-release.mjs'], { stdio: 'inherit' })
if (pkg.version === '1.1.10' && policy.gates?.githubReleasePublished === true) {
  execFileSync(process.execPath, ['scripts/check-v1110-readme-publication.mjs'], { stdio: 'inherit' })
}
if (pkg.version === '1.1.11' && policy.gates?.githubReleasePublished === true) {
  execFileSync(process.execPath, ['scripts/check-v1111-readme-publication.mjs'], { stdio: 'inherit' })
}
if (pkg.version === '1.1.12' && policy.gates?.githubReleasePublished === true) {
  execFileSync(process.execPath, ['scripts/check-v1112-readme-publication.mjs'], { stdio: 'inherit' })
}
if (pkg.version === '1.1.13' && policy.gates?.githubReleasePublished === true) {
  execFileSync(process.execPath, ['scripts/check-v1113-readme-publication.mjs'], { stdio: 'inherit' })
}
if (pkg.version === '1.1.14' && policy.gates?.githubReleasePublished === true) {
  execFileSync(process.execPath,['scripts/check-v1114-readme-publication.mjs'],{stdio:'inherit'})
}
if (pkg.version === '1.1.15' && policy.gates?.githubReleasePublished === true) execFileSync(process.execPath,['scripts/check-v1115-readme-publication.mjs'],{stdio:'inherit'})
if (pkg.version === '1.1.16' && policy.gates?.githubReleasePublished === true) execFileSync(process.execPath,['scripts/check-v1116-readme-publication.mjs'],{stdio:'inherit'})
if (pkg.version === '1.1.17' && policy.gates?.githubReleasePublished === true) execFileSync(process.execPath,['scripts/check-v1117-readme-publication.mjs'],{stdio:'inherit'})
if (pkg.version === '1.1.18' && policy.gates?.githubReleasePublished === true) execFileSync(process.execPath,['scripts/check-v1118-readme-publication.mjs'],{stdio:'inherit'})
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
if (['1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19'].includes(pkg.version)) {
  const published = policy.gates?.githubReleasePublished === true
  const version = pkg.version
  const patch = Number(version.split('.')[2])
  const next = '1.1.' + (patch + 1)
  const previous = patch === 0 ? '1.0.26' : '1.1.' + (patch - 1)
  const slices = ['v1.1.0-ui-and-workflow', 'v1.1.1-library-experience', 'v1.1.2-file-management', 'v1.1.3-foundation-workflow', 'v1.1.4-foundation-workflow', 'v1.1.5-foundation-hardening', 'v1.1.6-move-continuity', 'v1.1.7-save-history', 'v1.1.8-search-completeness', 'v1.1.9-work-session-continuity', 'v1.1.10-tags-collections', 'v1.1.11-graph-exploration', 'v1.1.12-content-backup', 'v1.1.13-pdf-reading-notes', 'v1.1.14-writing-delivery', 'v1.1.15-table-editing']
  const stage = 'M8-' + (28 + patch * 2 + Number(published)) + '-v' + version + (published ? '-published' : '-version-candidate')
  slices.push('v1.1.16-workbook-editing')
  slices.push('v1.1.17-docx-editing')
  slices.push('v1.1.18-pptx-editing')
  slices.push('v1.1.19-organizing')
  slices.push('v1.1.20-structured-editing')
  slices.push('v1.1.21-cross-library-copy')
  slices.push('v1.1.22-file-operation-history')
  slices.push('v1.1.23-attachment-management')
  slices.push('v1.1.24-long-markdown-organization')
  slices.push('v1.1.25-document-find-replace')
  slices.push('v1.1.26-structured-history')
  slices.push('v1.1.27-tags-collections')
  slices.push('v1.1.28-reference-repair')
  slices.push('v1.1.29-pdf-reading-continuity')
  slices.push('v1.1.30-table-entry-validation')
  slices.push('v1.1.31-workbook-entry-validation')
  slices.push('v1.1.32-workspace-restore-continuity')
  slices.push('v1.1.33-copy-reading-outcomes')
  slices.push('v1.1.34-portable-chapter-links')
  slices.push('v1.1.35-attachment-draft-references')
  slices.push('v1.1.36-contextual-command-actions')
  slices.push('v1.1.37-pdf-annotation-resume')
  required[5] = ['当前开发目标：' + '\x60' + development.developmentTargetVersion + '\x60', development.developmentTargetVersion === (published ? next : version)]
  required[7] = ['当前公开版本：' + '\x60' + development.publicVersion + '\x60', development.publicVersion === (published ? version : previous) && development.publicTag === 'v' + development.publicVersion]
  const names = ['界面与工作流升级', '资料库体验升级', '文件整理与侧栏精简', '基础功能深化', '基础功能深化', '安全导入与搜索一致性', '移动、改名与链接接续', '保存与历史深化', '搜索完整性', '工作现场', '标签与集合', '图谱深化', '内容备份', 'PDF 阅读笔记', '写作与交付', '轻量表格']
  names.push('XLSX 操作')
  names.push('DOCX 编辑')
  names.push('PPTX 编辑')
  names.push('画布与脑图')
  names.push('结构化编辑')
  names.push('跨库复制')
  names.push('文件整理记录')
  names.push('附件管理')
  names.push('长 Markdown 组织')
  names.push('当前文档查找替换')
  names.push('结构化源码历史与恢复')
  names.push('标签整理与集合复用')
  names.push('引用来源与关系核对')
  names.push('PDF 批注与阅读笔记接续')
  names.push('Table 录入与纠错')
  names.push('XLSX 连续录入与核对')
  names.push('工作现场恢复接续')
  names.push('带阅读成果复制')
  names.push('可移植章节链接')
  names.push('附件引用与草稿接续')
  names.push('上下文操作')
  names.push('PDF 批注跨重启接续')
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
  if (version === '1.1.9' && development.activeSlice?.id === 'v1.1.10-tags-collections') {
    required[9] = ['当前阶段：**v1.1.10 标签与集合开发**', published && development.releaseCandidate === false
      && development.currentStage === 'M8-48-v1.1.10-tags-collections' && fs.existsSync(development.activeSlice.document)]
  }
  if (version === '1.1.11' && development.activeSlice?.id === 'v1.1.12-content-backup') {
    required[9] = ['当前阶段：**v1.1.12 内容备份开发**', published && policy.appVersion === '1.1.11'
      && development.publicVersion === '1.1.11' && development.runtimeBaseVersion === '1.1.11'
      && development.developmentTargetVersion === '1.1.12' && development.releaseCandidate === false
      && development.currentStage === 'M8-52-v1.1.12-content-backup' && fs.existsSync(development.activeSlice.document)]
  }
}

if (pkg.version === '1.2.0') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.1' : '1.2.0')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.0' : '1.1.37') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.0 已发布**' : '当前阶段：**v1.2.0 界面与基础体验候选**', development.currentStage === (published ? 'M8-105-v1.2.0-published' : 'M8-104-v1.2.0-ui-foundation-candidate') && development.activeSlice?.id === 'v1.2.0-ui-foundation' && fs.existsSync(development.activeSlice.document)]
}

if (pkg.version === '1.2.1') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.2' : '1.2.1')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.1' : '1.2.0') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.1 已发布**' : '当前阶段：**v1.2.1 移动阅读接续候选**', development.currentStage === (published ? 'M8-107-v1.2.1-published' : 'M8-106-v1.2.1-reading-continuity-candidate') && development.activeSlice?.id === 'v1.2.1-file-reading-continuity' && fs.existsSync(development.activeSlice.document)]
}

if (pkg.version === '1.2.2') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.3' : '1.2.2')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.2' : '1.2.1') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.2 已发布**' : '当前阶段：**v1.2.2 PDF 批注撤销重做候选**', development.currentStage === (published ? 'M8-109-v1.2.2-published' : 'M8-108-v1.2.2-annotation-history-candidate') && development.activeSlice?.id === 'v1.2.2-pdf-annotation-history' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.3') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.4' : '1.2.3')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.3' : '1.2.2') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.3 已发布**' : '当前阶段：**v1.2.3 PDF 批注批量整理候选**', development.currentStage === (published ? 'M8-111-v1.2.3-published' : 'M8-110-v1.2.3-annotation-batch-candidate') && development.activeSlice?.id === 'v1.2.3-pdf-annotation-batch' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.4') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.5' : '1.2.4')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.4' : '1.2.3') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.4 已发布**' : '当前阶段：**v1.2.4 表格选区填充候选**', development.currentStage === (published ? 'M8-113-v1.2.4-published' : 'M8-112-v1.2.4-table-fill-candidate') && development.activeSlice?.id === 'v1.2.4-table-range-fill' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.5') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.6' : '1.2.5')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.5' : '1.2.4') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.5 已发布**' : '当前阶段：**v1.2.5 表格行插入与复制候选**', development.currentStage === (published ? 'M8-115-v1.2.5-published' : 'M8-114-v1.2.5-table-row-actions-candidate') && development.activeSlice?.id === 'v1.2.5-table-row-actions' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.6') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.7' : '1.2.6')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.6' : '1.2.5') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.6 已发布**' : '当前阶段：**v1.2.6 表格列位置调整候选**', development.currentStage === (published ? 'M8-117-v1.2.6-published' : 'M8-116-v1.2.6-table-column-order-candidate') && development.activeSlice?.id === 'v1.2.6-table-column-order' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.7') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.8' : '1.2.7')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.7' : '1.2.6') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.7 已发布**' : '当前阶段：**v1.2.7 JSON 数组项位置调整候选**', development.currentStage === (published ? 'M8-119-v1.2.7-published' : 'M8-118-v1.2.7-json-array-order-candidate') && development.activeSlice?.id === 'v1.2.7-json-array-order' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.8') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.9' : '1.2.8')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.8' : '1.2.7') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.8 已发布**' : '当前阶段：**v1.2.8 JSON 字段与数组项复用候选**', development.currentStage === (published ? 'M8-121-v1.2.8-published' : 'M8-120-v1.2.8-json-node-copy-candidate') && development.activeSlice?.id === 'v1.2.8-json-node-copy' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.9') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.10' : '1.2.9')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.9' : '1.2.8') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.9 已发布**' : '当前阶段：**v1.2.9 TOML 配置值编辑候选**', development.currentStage === (published ? 'M8-123-v1.2.9-published' : 'M8-122-v1.2.9-toml-value-edit-candidate') && development.activeSlice?.id === 'v1.2.9-toml-value-edit' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.10') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.11' : '1.2.10')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.10' : '1.2.9') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.10 已发布**' : '当前阶段：**v1.2.10 YAML 简单值编辑候选**', development.currentStage === (published ? 'M8-125-v1.2.10-published' : 'M8-124-v1.2.10-yaml-value-edit-candidate') && development.activeSlice?.id === 'v1.2.10-yaml-value-edit' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.11') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.12' : '1.2.11')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.11' : '1.2.10') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.11 已发布**' : '当前阶段：**v1.2.11 XML 属性值编辑候选**', development.currentStage === (published ? 'M8-127-v1.2.11-published' : 'M8-126-v1.2.11-xml-attribute-edit-candidate') && development.activeSlice?.id === 'v1.2.11-xml-attribute-edit' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.12') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.13' : '1.2.12')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.12' : '1.2.11') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.12 已发布**' : '当前阶段：**v1.2.12 XML 叶节点文字编辑候选**', development.currentStage === (published ? 'M8-129-v1.2.12-published' : 'M8-128-v1.2.12-xml-leaf-text-edit-candidate') && development.activeSlice?.id === 'v1.2.12-xml-leaf-text-edit' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.13') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.14' : '1.2.13')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.13' : '1.2.12') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.13 已发布**' : '当前阶段：**v1.2.13 XML 元素复制候选**', development.currentStage === (published ? 'M8-131-v1.2.13-published' : 'M8-130-v1.2.13-xml-element-copy-candidate') && development.activeSlice?.id === 'v1.2.13-xml-element-copy' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.14') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.15' : '1.2.14')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.14' : '1.2.13') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.14 已发布**' : '当前阶段：**v1.2.14 XML 同级元素排序候选**', development.currentStage === (published ? 'M8-133-v1.2.14-published' : 'M8-132-v1.2.14-xml-sibling-reorder-candidate') && development.activeSlice?.id === 'v1.2.14-xml-sibling-reorder' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.15') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.16' : '1.2.15')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.15' : '1.2.14') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.15 已发布**' : '当前阶段：**v1.2.15 XML 元素删除候选**', development.currentStage === (published ? 'M8-135-v1.2.15-published' : 'M8-134-v1.2.15-xml-element-delete-candidate') && development.activeSlice?.id === 'v1.2.15-xml-element-delete' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.16') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.17' : '1.2.16')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.16' : '1.2.15') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.16 已发布**' : '当前阶段：**v1.2.16 XML 属性管理候选**', development.currentStage === (published ? 'M8-137-v1.2.16-published' : 'M8-136-v1.2.16-xml-attribute-management-candidate') && development.activeSlice?.id === 'v1.2.16-xml-attribute-management' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.17') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.18' : '1.2.17')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.17' : '1.2.16') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.17 已发布**' : '当前阶段：**v1.2.17 准确保存状态候选**', development.currentStage === (published ? 'M8-139-v1.2.17-published' : 'M8-138-v1.2.17-structured-savepoint-continuity-candidate') && development.activeSlice?.id === 'v1.2.17-structured-savepoint-continuity' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.18') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.19' : '1.2.18')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.18' : '1.2.17') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.18 已发布**' : '当前阶段：**v1.2.18 XML 创建与重命名候选**', development.currentStage === (published ? 'M8-141-v1.2.18-published' : 'M8-140-v1.2.18-xml-create-rename-candidate') && development.activeSlice?.id === 'v1.2.18-xml-create-rename' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.19') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.20' : '1.2.19')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.19' : '1.2.18') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.19 已发布**' : '当前阶段：**v1.2.19 YAML 字段重命名候选**', development.currentStage === (published ? 'M8-143-v1.2.19-published' : 'M8-142-v1.2.19-yaml-key-rename-candidate') && development.activeSlice?.id === 'v1.2.19-yaml-key-rename' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.20') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.21' : '1.2.20')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.20' : '1.2.19') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.20 已发布**' : '当前阶段：**v1.2.20 TOML 字段重命名候选**', development.currentStage === (published ? 'M8-145-v1.2.20-published' : 'M8-144-v1.2.20-toml-key-rename-candidate') && development.activeSlice?.id === 'v1.2.20-toml-key-rename' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.21') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.22' : '1.2.21')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.21' : '1.2.20') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.21 已发布**' : '当前阶段：**v1.2.21 YAML 字段新增与删除候选**', development.currentStage === (published ? 'M8-147-v1.2.21-published' : 'M8-146-v1.2.21-yaml-field-management-candidate') && development.activeSlice?.id === 'v1.2.21-yaml-field-management' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.22') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.23' : '1.2.22')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.22' : '1.2.21') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.22 已发布**' : '当前阶段：**v1.2.22 TOML 字段新增与删除候选**', development.currentStage === (published ? 'M8-149-v1.2.22-published' : 'M8-148-v1.2.22-toml-field-management-candidate') && development.activeSlice?.id === 'v1.2.22-toml-field-management' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.23') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.24' : '1.2.23')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.23' : '1.2.22') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.23 已发布**' : '当前阶段：**v1.2.23 YAML 列表项新增与删除候选**', development.currentStage === (published ? 'M8-151-v1.2.23-published' : 'M8-150-v1.2.23-yaml-sequence-items-candidate') && development.activeSlice?.id === 'v1.2.23-yaml-sequence-items' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.24') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.25' : '1.2.24')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.24' : '1.2.23') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.24 已发布**' : '当前阶段：**v1.2.24 TOML 数组项新增与删除候选**', development.currentStage === (published ? 'M8-153-v1.2.24-published' : 'M8-152-v1.2.24-toml-array-items-candidate') && development.activeSlice?.id === 'v1.2.24-toml-array-items' && fs.existsSync(development.activeSlice.document)]
}
if (pkg.version === '1.2.25') {
  const published = policy.gates?.githubReleasePublished === true
  required[5] = [`当前开发目标：\`${development.developmentTargetVersion}\``, development.developmentTargetVersion === (published ? '1.2.26' : '1.2.25')]
  required[7] = [`当前公开版本：\`${development.publicVersion}\``, development.publicVersion === (published ? '1.2.25' : '1.2.24') && development.publicTag === `v${development.publicVersion}`]
  required[9] = [published ? '当前阶段：**v1.2.25 已发布**' : '当前阶段：**v1.2.25 TOML 数组项直接改值候选**', development.currentStage === (published ? 'M8-155-v1.2.25-published' : 'M8-154-v1.2.25-toml-array-item-values-candidate') && development.activeSlice?.id === 'v1.2.25-toml-array-item-values' && fs.existsSync(development.activeSlice.document)]
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
