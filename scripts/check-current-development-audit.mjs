import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const matrix = JSON.parse(fs.readFileSync('shared/release-capability-matrix.json', 'utf8'))
const policy = JSON.parse(fs.readFileSync('shared/v1-community-release-policy.json', 'utf8'))
const audit = fs.readFileSync('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md', 'utf8')
const counts = matrix.formats.reduce((result, item) => {
  result[item.readiness] = (result[item.readiness] ?? 0) + 1
  return result
}, {})
const required = [
  ['41 类格式', matrix.formats.length === 41],
  ['29 类为已验证', counts.verified === 29],
  ['6 类为有限能力', counts['verified-with-limitations'] === 6],
  ['6 类依赖外部程序', counts['external-dependency'] === 6],
  ['10 套发布能力配置', matrix.profiles.length === 10],
  [`当前版本：\`${pkg.version}\``, matrix.appVersion === pkg.version && policy.appVersion === pkg.version],
  ['P0、UI-1、UI-2、UI-3 与 UI-4 均已完成', true],
  [
    policy.gates.githubReleasePublished
      ? '当前阶段：**`1.0.3` 社区发布完成与稳定性观察**'
      : '当前阶段：**`1.0.3` 补丁打包与社区发布执行**',
    pkg.version === '1.0.3',
  ],
]

for (const [token, condition] of required) {
  if (!condition) throw new Error(`[current-development-audit] source-of-truth no longer supports: ${token}`)
  if (!audit.includes(token)) throw new Error(`[current-development-audit] audit is missing: ${token}`)
}

for (const section of ['## 1. 审计结论', '## 2. 需求对齐', '## 3. 当前开发状态', '## 4. 发布边界', '## 5. 接手后的顺序']) {
  if (!audit.includes(section)) throw new Error(`[current-development-audit] audit is missing section: ${section}`)
}

console.log(`Current development audit passed: v${pkg.version}, 41 format mappings and release stage are aligned.`)
