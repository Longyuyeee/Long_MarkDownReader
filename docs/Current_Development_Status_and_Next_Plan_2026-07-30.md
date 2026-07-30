# 当前开发状态与下一步计划（2026-07-30）

## 当前阶段结论

本轮推进到 R3C：管理备份导入预检与可迁移恢复已实现。项目仍保持 `releaseCandidate=false`，下一阶段是 R3D 隐私净化诊断包。

`shared/data-resilience-policy.json` 当前状态：

- R3A：知识索引健康与恢复，已实现。
- R3B：管理备份导出，已实现。
- R3C：管理备份导入预检与可迁移恢复，已实现。
- R3D：隐私净化诊断包，待实现。

## 本轮完成内容

- 新增 Tauri 命令 `preflight_management_backup_import`。
- 新增 Tauri 命令 `restore_management_backup`。
- 管理备份导入器固定校验 ZIP 成员白名单、manifest schema/stage、bytes 和 SHA-256 摘要。
- 设置页“管理备份”区域增加“导入恢复”入口。
- 导入恢复流程要求用户在当前机器重新映射每个知识库目录。
- 恢复配置使用可靠写入，不恢复 API Key、系统凭据、文档正文、缓存正文、旧机器绝对路径或 Git Remote 明文。
- 更新 R3 机器契约检查脚本，确保 R3A/R3B/R3C 与代码、前端和文档一致。
- 新增专项审计文档：[`R3C_Management_Backup_Import_Restore_Audit_2026-07-30.md`](./R3C_Management_Backup_Import_Restore_Audit_2026-07-30.md)。

## 与用户最初需求的对齐

用户基础需求是：覆盖日常管理和基础编辑，把 PDF、图表、思维导图、WPS/Office、TXT、JSON 等常用格式纳入统一管理系统。

当前能力大体状态：

- Markdown、TXT/开发文本、JSON/JSONC、YAML/XML/TOML、日志和常见配置：已进入统一识别、阅读、基础编辑或安全边界管理。
- PDF：阅读、范围读取、OCR sidecar、批注和页面级整理能力已形成，但正文级编辑仍不是目标能力。
- 图表/思维导图：Mermaid、Canvas、OPML、Table 图表已形成应用内工作面；知识图谱已接入全局/局部关系、反链、关系筛选和图谱转 Canvas。
- XLSX：基础单元格与结构能力较强，Pivot/动态数组等高级能力仍在证据门禁和可靠保存白名单内推进。
- DOCX/PPTX：可读和受限基础编辑子集已经推进，复杂对象仍坚持只读或隔离副本策略。
- WPS 原生 `.wps/.et/.dps`：识别和外部打开已完成，正文解析/编辑暂不开放。
- 管理系统韧性：R3A/R3B/R3C 已补齐索引恢复、管理备份导出、跨机器导入恢复。

因此，初始需求的“日常管理系统骨架”已经基本成型；剩余主要是发布级诊断、正式安装发布、以及少数高级格式能力和外部生产者证据收口。

## 下一阶段：R3D 隐私净化诊断包

目标：用户遇到问题时，可以导出一个安全诊断包给开发者排查，但包内不泄漏文档正文、完整路径、API Key、系统凭据或缓存正文。

建议执行顺序：

1. 定义 `shared/data-resilience-policy.json` 中 R3D 的诊断包 schema。
2. 新增后端导出命令，例如 `export_privacy_diagnostic_bundle`。
3. ZIP 固定成员建议：
   - `manifest.json`
   - `diagnostics/environment.redacted.json`
   - `diagnostics/index-state-summary.json`
   - `contracts/file-formats.json`
   - `contracts/release-capability-matrix.json`
   - `contracts/data-resilience-policy.json`
4. 收集内容只允许：
   - 应用版本、平台、Tauri/Rust/Node 构建信息摘要。
   - 格式能力合同。
   - 知识索引健康摘要和错误分类。
   - 最近错误类型统计，不包含用户正文。
5. 增加泄漏拒绝测试：
   - API Key 注入。
   - 绝对路径注入。
   - 文档正文注入。
   - 缓存正文注入。
   - 额外 ZIP 成员注入。
6. 设置页增加“导出隐私诊断包”按钮。
7. 更新 `npm run check:r3-data-resilience-contract`，将 R3D 标记为 implemented，下一阶段移动到 R4。

## 后续收口阶段

R3D 完成后进入 R4：

- 正式签名。
- Windows 10/11 VM 安装矩阵。
- 升级、降级拒绝、卸载保留、文件关联恢复。
- 明确 Debug 构建与正式发布制品边界。

外部证据门禁仍需在具备真实软件的机器上补齐：

- WPS ODT 生产者证据。
- Microsoft Excel 生产者证据。

## 交接注意事项

- 不要提交 `.claude/settings.local.json`。
- 当前本地 `src-tauri/src/formats/pptx.rs` 有既有未提交改动，本轮不属于 R3C 范围，提交时需排除。
- 继续直接在 `main` 推进时，每个阶段完成后都要更新审计文档、运行契约检查、提交并推送。
