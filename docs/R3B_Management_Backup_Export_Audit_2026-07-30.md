# R3B 管理备份导出审计

日期：2026-07-30
阶段：R3B
结论：管理备份导出已形成首个可用闭环；R3 仍未收口，`releaseCandidate=false`。

## 本步目标

R3B 面向“换电脑、迁移配置、审计当前能力”的管理系统底座。导出包必须帮助后续恢复应用元数据，但不能把用户知识库正文、凭据、完整本机路径或可恢复缓存正文带出本机。

## 本步完成

- 新增 Tauri 命令 `export_management_backup`。
- 设置页“系统集成”区域新增“管理备份”导出按钮，用户选择 `.zip` 路径后生成备份包。
- 备份包固定包含：
  - `manifest.json`
  - `config.redacted.json`
  - `contracts/file-formats.json`
  - `contracts/release-capability-matrix.json`
  - `contracts/data-resilience-policy.json`
- `config.redacted.json` 只保留设置、库名称、路径末级名称、路径指纹、Git remote 指纹、分支、保存搜索和能力相关元数据。
- API Key 继续由系统凭据管理，备份包不读取也不包含明文凭据。
- 导出目标必须是新的 `.zip` 文件；若目标已存在则拒绝，避免误覆盖。
- 新增 `management_backup_excludes_paths_and_credentials` Rust 回归，验证完整用户路径、API Key 和 remote 明文不会进入备份包。
- `shared/data-resilience-policy.json` 已将 R3B 标记为 `implemented`，下一阶段移动到 R3C。

## 边界

- R3B 只导出，不导入、不恢复、不合并。
- 备份包中的库路径不可直接恢复为完整路径；R3C 导入时必须让用户重新确认或映射库目录。
- 保存搜索的查询词属于用户配置元数据，当前纳入备份；R3D 诊断包不得默认包含查询词。
- 备份包不包含知识索引正文、PDF OCR 正文、批注正文、文档内容、历史版本或系统凭据。

## 验证

- `npm.cmd run build`：通过。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml commands::backup -- --nocapture`：通过。
- `npm.cmd run check:r3-data-resilience-contract`：通过。
- `npm.cmd run check:format-contract`：通过。

## 后续阶段

下一步进入 **R3C：备份导入与原子恢复**：

1. 读取 R3B ZIP 并验证固定成员、manifest 摘要和 schema。
2. 对配置版本、库指纹、保存搜索和能力合同进行预检。
3. 要求用户确认库路径映射，不自动恢复完整旧路径。
4. 生成冲突预览，禁止覆盖现有配置。
5. 使用临时文件和回滚机制完成原子恢复。

R3C 完成后进入 R3D 隐私净化诊断包；再进入 R4 正式签名与 Windows VM 发布矩阵。
