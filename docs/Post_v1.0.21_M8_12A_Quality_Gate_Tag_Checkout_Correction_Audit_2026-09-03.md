# Post-v1.0.21 M8-12A Quality Gate 历史标签检出纠偏审计

## 审计结论

`v1.0.21` 发布后的通用 GitHub Quality Gate 失败不是产品代码回归，而是 CI 检出合同与既有补丁发布门不一致。补丁发布门会核验 `v1.0.17` 等历史公开标签，但工作流使用 `actions/checkout@v6` 默认配置，只获取当前提交深度 1 且不获取标签。

本阶段只修正 Quality Gate 的仓库检出合同和审计脚本的 Node 运行声明，不修改产品运行代码、运行时版本、已发布安装包、Tag 或 Release。`v1.0.21` 公开资产保持不可变。

完整门禁复跑同时发现，Node 22.12 不会默认剥离 `.ts` 类型，直接从 `.mjs` 审计脚本导入 `src/utils/graphSemanticZoom.ts` 会产生 `ERR_UNKNOWN_FILE_EXTENSION`。图谱产品构建本身正常；这是检查器运行时声明不完整。相关四个独立检查显式使用 Node 22 支持的 `--experimental-strip-types`，总审计则以同一 Node 可执行文件和该参数隔离运行图谱交互检查，避免依赖调用机器隐含环境变量。

## 修正前实际结果

- 失败运行：GitHub Actions `33494227221`。
- 失败提交：`f450363eee05fde18736fe09c508b2bbf0db376f`。
- 检出参数：`fetch-depth: 1`、`fetch-tags: false`。
- 稳定失败：历史发布检查调用 `git rev-list -n 1 v1.0.17` 时报告 `fatal: ambiguous argument 'v1.0.17'`。
- 同一 HEAD 的本机构建、当前开发审计、知识图谱交互审计和社区发布合同均通过。
- `v1.0.21 Candidate Installer Lifecycle` 运行 `33488674071` 使用完整历史并成功，证明候选安装生命周期没有因此失效。

## 修正内容

`.github/workflows/quality-gate.yml` 的检出步骤显式设置：

```yaml
with:
  fetch-depth: 0
  fetch-tags: true
```

这让通用 Quality Gate 获得补丁发布审计所依赖的完整提交历史和标签，不改变 `npm run ci:patch-release` 的检查范围，也不绕过任何历史门禁。

同时补齐检查器的 Node 运行合同：

- `check:m8-1-graph-usability`
- `check:post-v120-graph-interaction-polish`
- `check:post-v115-m3b1-semantic-zoom-community-overview`
- `check:post-v115-m3b2-community-contours-semantic-hierarchy`

上述直接加载 TypeScript 工具模块的入口均显式启用类型剥离。`check-current-development-audit.mjs` 在聚合审计中以相同参数隔离启动所有直接加载 TypeScript 图谱工具的检查，从而覆盖单独执行与总门执行两条路径；未加载 TypeScript 的既有检查继续使用普通 Node 入口。

## 验收要求

1. 本地 `npm run ci:patch-release` 全部通过。
2. 当前开发状态仍为公开/运行时 `1.0.21`、下一目标 `1.0.22`、阶段 `M8-12`。
3. 工作区除本次工作流与审计文档外无意外修改。
4. 推送后新触发的 GitHub Quality Gate 成功，并能解析历史发布标签。

## 本地验收结果

- `git diff --check`：通过。
- 四条直接加载 TypeScript 图谱工具的专项检查：通过。
- `npm run check:current-development-audit`：通过。
- `npm run ci:patch-release`：通过。
- 前端生产构建：6,276 modules transformed。
- Rust `cargo check --locked`：通过。
- `npm audit --omit=dev --registry=https://registry.npmjs.org`：0 vulnerabilities。

远端绿色运行属于推送后验收，必须以本次修复提交触发的新 Quality Gate 为准。

## 边界与接续点

- 本修复不是 `v1.0.22` 产品功能开发，不提升版本。
- 不重建、不覆盖、不重新发布 `v1.0.21`。
- 远端 Quality Gate 通过后，唯一接续点为 M8-12B：使用公开 Release 资产执行官方 `v1.0.20 -> v1.0.21` 应用内更新观察。
