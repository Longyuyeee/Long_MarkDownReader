# 当前开发状态与下一步计划（2026-07-30）

## 当前阶段结论

本轮已推进到 R3D：隐私净化诊断包已实现。R3 数据韧性与诊断阶段代码侧已经收口；项目仍保持 `releaseCandidate=false`，下一阶段是 R4 正式签名与 Windows VM 发布矩阵。

`shared/data-resilience-policy.json` 当前状态：

- R3A：知识索引健康与恢复，已实现。
- R3B：管理备份导出，已实现。
- R3C：管理备份导入预检与可迁移恢复，已实现。
- R3D：隐私净化诊断包，已实现。

## R3C 完成内容

- 新增 Tauri 命令 `preflight_management_backup_import`。
- 新增 Tauri 命令 `restore_management_backup`。
- 管理备份导入器固定校验 ZIP 成员白名单、manifest schema/stage、bytes 和 SHA-256 摘要。
- 设置页“管理备份”区域增加“导入恢复”入口。
- 导入恢复流程要求用户在当前机器重新映射每个知识库目录。
- 恢复配置使用可靠写入，不恢复 API Key、系统凭据、文档正文、缓存正文、旧机器绝对路径或 Git Remote 明文。
- 更新 R3 机器契约检查脚本，确保 R3A/R3B/R3C 与代码、前端和文档一致。
- 新增专项审计文档：[`R3C_Management_Backup_Import_Restore_Audit_2026-07-30.md`](./R3C_Management_Backup_Import_Restore_Audit_2026-07-30.md)。

## R3D 完成内容

- 新增 Tauri 命令 `export_privacy_diagnostic_bundle`。
- 设置页新增 `Privacy Diagnostic` 导出入口。
- 诊断包固定包含 manifest、脱敏环境摘要、脱敏配置摘要、索引状态摘要和三份能力/韧性合同。
- 诊断包拒绝文档正文、缓存正文、API Key、系统凭据、完整用户路径、Git Remote 明文、AI endpoint 明文、原始错误消息和环境变量。
- 索引错误只输出稳定错误分类，不输出可能带路径的原始错误字符串。
- R3 机器契约已升级为 R3A/R3B/R3C/R3D 全阶段检查。
- 新增专项审计文档：[`R3D_Privacy_Diagnostic_Bundle_Audit_2026-07-30.md`](./R3D_Privacy_Diagnostic_Bundle_Audit_2026-07-30.md)。

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

因此，初始需求的“日常管理系统骨架”已经基本成型；R3 完成后，剩余主要是正式安装发布、签名/VM 验证、以及少数高级格式能力和外部生产者证据收口。

## 下一阶段：R4 正式签名与 Windows VM 发布矩阵

目标：把当前 Debug/开发态能力推进到可公开发布的安装生命周期验证，但仍不把 `releaseCandidate=false` 改成 true，除非真实签名和 VM 矩阵全部通过。

建议执行顺序：

1. 审计现有 MSI/NSIS 构建配置、应用 ID、文件关联和升级 GUID。
2. 定义 R4 机器契约，例如 `shared/windows-release-readiness-policy.json`。
3. 固定 Windows 10/11 VM 安装、升级、卸载、文件关联恢复和降级拒绝矩阵。
4. 区分未签名 Debug、测试签名和正式签名制品。
5. 增加安装包哈希、签名状态、版本号、关联扩展名和卸载保留策略审计。
6. 设置发布能力页只显示通过真实证据的发布状态，不得提前宣称正式发布。
7. 完成 R4 审计后再评估是否进入 release candidate。

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
- 当前本地 `src-tauri/src/formats/pptx.rs` 有既有未提交改动，本轮不属于 R3D 范围，提交时需排除。
- 继续直接在 `main` 推进时，每个阶段完成后都要更新审计文档、运行契约检查、提交并推送。
