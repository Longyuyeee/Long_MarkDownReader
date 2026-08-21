import fs from 'node:fs'
import './check-community-updater-contract.mjs'
import './check-command-strip-layout.mjs'
import './check-v106-managed-updater-lifecycle.mjs'
import './check-v107-managed-updater-lifecycle.mjs'
import './check-v108-managed-updater-lifecycle.mjs'
import './check-v109-managed-updater-lifecycle.mjs'
import './check-v110-managed-updater-lifecycle.mjs'
import './check-v111-managed-updater-lifecycle.mjs'
import './check-v112-managed-updater-lifecycle.mjs'
import './check-code-file-creation.mjs'
import './check-cf1-code-file-creation-audit.mjs'
import './check-ux51-external-window-lifecycle.mjs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const matrix = JSON.parse(fs.readFileSync('shared/release-capability-matrix.json', 'utf8'))
const policy = JSON.parse(fs.readFileSync('shared/v1-community-release-policy.json', 'utf8'))
const currentUpdater = JSON.parse(fs.readFileSync('shared/v112-managed-updater-lifecycle-policy.json', 'utf8'))
const audit = fs.readFileSync('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md', 'utf8')
const counts = matrix.formats.reduce((result, item) => {
  result[item.readiness] = (result[item.readiness] ?? 0) + 1
  return result
}, {})
const currentUpdaterMatchesPackage = currentUpdater.status === 'hosted-managed-update-passed'
  && currentUpdater.releases?.current?.version === pkg.version
const expectedStage = currentUpdaterMatchesPackage
  ? `当前阶段：**\`${pkg.version}\` 无签名社区版发布与更新链已收口**`
  : policy.gates?.githubReleasePublished === true
    ? `当前阶段：**\`${pkg.version}\` 无签名社区版已发布**`
  : policy.gates?.qualityGatePassed === true
    ? `当前阶段：**\`${pkg.version}\` 无签名社区版待发布**`
    : `当前阶段：**\`${pkg.version}\` 无签名社区版发布候选准备中**`
const required = [
  ['43 类格式', matrix.formats.length === 43],
  ['30 类为已验证', counts.verified === 30],
  ['7 类为有限能力', counts['verified-with-limitations'] === 7],
  ['6 类依赖外部程序', counts['external-dependency'] === 6],
  ['11 套发布能力配置', matrix.profiles.length === 11],
  [`当前版本：\`${pkg.version}\``, matrix.appVersion === pkg.version && policy.appVersion === pkg.version],
  ['P0、UI-1、UI-2、UI-3 与 UI-4 均已完成', true],
  [expectedStage, policy.currentStatus.startsWith(`v${pkg.version}-community-release-`)],
]

for (const [token, condition] of required) {
  if (!condition) throw new Error(`[current-development-audit] source-of-truth no longer supports: ${token}`)
  if (!audit.includes(token)) throw new Error(`[current-development-audit] audit is missing: ${token}`)
}

for (const section of ['## 1. 审计结论', '## 2. 需求对齐', '## 3. 当前开发状态', '## 4. 发布边界', '## 5. 接手后的顺序']) {
  if (!audit.includes(section)) throw new Error(`[current-development-audit] audit is missing section: ${section}`)
}

console.log(`Current development audit passed: v${pkg.version}, 43 format mappings and release stage are aligned.`)
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
