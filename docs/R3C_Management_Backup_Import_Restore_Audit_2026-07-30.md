# R3C 管理备份导入预检与可迁移恢复审计

结论：R3C 已完成产品内闭环；R3 仍未收口，`releaseCandidate=false`。

## 本轮实现

- 后端新增 `preflight_management_backup_import`：读取管理备份 ZIP，验证固定条目白名单、manifest schema/stage、每个条目的 bytes 与 SHA-256 摘要。
- 后端新增 `restore_management_backup`：只从 `config.redacted.json` 恢复脱敏管理配置，并要求用户把每个知识库路径指纹重新映射到当前机器目录。
- 设置页“管理备份”从单一导出升级为“导出 + 导入恢复”。
- 导入恢复流程为：选择 `.zip` → 预检 → 逐个选择当前机器知识库目录 → 用户确认覆盖当前管理配置 → 可靠写入 `config.json` → 重新加载设置。
- `shared/data-resilience-policy.json` 已将 R3C 标记为 `implemented`，下一阶段为 R3D。
- `npm run check:r3-data-resilience-contract` 已升级为 R3A/R3B/R3C 三阶段契约检查。

## 隐私与安全边界

- 恢复不会导入文档正文、缓存正文、API Key、系统凭据或旧机器绝对路径。
- 旧知识库路径只以 `pathFingerprint` 和 `pathLeaf` 参与预检提示；完整旧路径不会写回。
- Git Remote 不会恢复明文 URL；如果备份中存在 remote 指纹，恢复后只保留 `gitEnabled/gitBranch`，用户需在设置中重新填写 remote。
- ZIP 成员必须精确等于：
  - `manifest.json`
  - `config.redacted.json`
  - `contracts/file-formats.json`
  - `contracts/release-capability-matrix.json`
  - `contracts/data-resilience-policy.json`
- 导入器拒绝额外成员、重复成员、路径穿越、过大备份和 manifest 摘要漂移。

## 对齐最初需求的价值

用户最初要求是“覆盖日常管理和基础编辑，把内容成体系管理”，并希望换电脑开发时能可靠接续。R3C 补齐的是管理系统的“迁移与恢复”底座：

- 已支持把应用管理配置、库清单摘要、保存搜索和能力合同带到新机器。
- 不把用户知识库正文打进备份，避免把“管理配置迁移”误做成“文档资料同步”。
- 通过路径重新映射，让新电脑可以接上已有知识库目录，而不是依赖旧电脑绝对路径。

## 本轮验证

计划验证项：

- `cargo test --locked --manifest-path src-tauri/Cargo.toml commands::backup -- --nocapture`
- `npm.cmd run check:r3-data-resilience-contract`
- `npm.cmd run check:format-contract`
- `npm.cmd run build`
- `git diff --check`

## 尚未完成

- R3D：隐私净化诊断包。目标是导出脱敏环境、版本、能力合同、索引状态和错误分类，用于用户反馈问题和跨机器排查。
- R4：正式签名与 Windows VM 安装/升级/卸载/文件关联矩阵。
- 外部证据门禁：WPS ODT 与 Microsoft Excel 生产者证据仍取决于具备对应真实软件的机器。

## 下一步建议

进入 R3D：

1. 定义诊断包固定 ZIP 成员和 JSON schema。
2. 收集应用版本、平台、能力合同、索引健康摘要和错误分类。
3. 明确拒绝文档正文、路径明文、API Key、系统凭据和缓存正文。
4. 增加泄漏注入拒绝测试。
5. 设置页增加“导出隐私诊断包”入口。
