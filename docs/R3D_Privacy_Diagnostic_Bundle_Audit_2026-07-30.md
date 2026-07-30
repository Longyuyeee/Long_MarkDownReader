# R3D 隐私诊断包审计

结论：R3D 已完成产品内闭环；R3 数据韧性与诊断阶段代码侧收口。产品仍保持 `releaseCandidate=false`，下一阶段进入 R4 正式签名与 Windows VM 发布矩阵。

## 本轮实现

- 新增 Tauri 命令 `export_privacy_diagnostic_bundle`。
- 设置页新增 `Privacy Diagnostic` 导出入口。
- 诊断包为固定 ZIP，包含：
  - `manifest.json`
  - `diagnostics/environment.redacted.json`
  - `diagnostics/config-summary.redacted.json`
  - `diagnostics/index-state-summary.json`
  - `contracts/file-formats.json`
  - `contracts/release-capability-matrix.json`
  - `contracts/data-resilience-policy.json`
- 诊断包 manifest 记录 schema、stage、app version、创建时间、成员摘要、排除项和隐私边界。
- `shared/data-resilience-policy.json` 已将 R3D 标记为 `implemented`，`nextStage=R4`。
- `npm run check:r3-data-resilience-contract` 已升级为 R3A/R3B/R3C/R3D 全阶段检查。

## 隐私边界

诊断包允许：

- 应用版本、OS、CPU 架构、debug/release 构建标识。
- 三份能力/韧性合同的 SHA-256 摘要和合同快照。
- 脱敏配置摘要：主题、编辑模式、AI provider/model、endpoint 是否配置及 endpoint 指纹。
- 知识库数量、路径指纹、路径叶子名、Git 是否启用、remote 是否配置及 remote 指纹。
- 每个库的索引状态摘要：state、schemaVersion、builtAt、source/object/relation 数量、cacheBytes、recoveryAvailable、staleSourceCount。
- 错误分类，例如 `index-parse-or-schema`、`index-size-limit`、`filesystem-permission`、`other-redacted-error`。

诊断包禁止：

- 文档正文。
- 缓存正文。
- API Key。
- 系统凭据。
- 完整用户路径。
- Git Remote 明文。
- AI endpoint 明文。
- 原始错误消息。
- 环境变量。

## 对齐最初需求的价值

用户希望软件成为覆盖日常管理与基础编辑的专业管理系统。R3D 补齐的是“可排障、可交接、可发布前审计”的管理系统底座：

- 用户遇到索引、配置或格式能力问题时，可以导出诊断包给开发者。
- 诊断包能说明能力合同、配置摘要和索引健康，不需要泄漏个人文档。
- 与 R3A/R3B/R3C 合在一起，已经覆盖索引恢复、管理备份、跨机器恢复和隐私排障。

## 本轮验证

计划验证项：

- `cargo test --locked --manifest-path src-tauri/Cargo.toml commands::diagnostics -- --nocapture`
- `npm.cmd run check:r3-data-resilience-contract`
- `npm.cmd run check:format-contract`
- `npm.cmd run build`
- `git diff --check`

## 当前剩余方向

下一阶段进入 R4：

1. 正式签名策略与证书边界。
2. Windows 10/11 VM 安装矩阵。
3. 升级、降级拒绝、卸载保留与文件关联恢复。
4. 明确 Debug 构建和正式发布制品的公开边界。

外部证据门禁继续保留：

- WPS ODT 生产者证据。
- Microsoft Excel 生产者证据。
