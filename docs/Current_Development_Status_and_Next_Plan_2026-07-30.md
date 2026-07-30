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

## R4A update - Windows release readiness contract

Current stage after this update: R4A is implemented as a release-readiness contract. The app is still not a release candidate; `releaseCandidate=false` remains required.

New source of truth:

- `shared/windows-release-readiness-policy.json`
- `scripts/check-r4-windows-release-readiness-contract.mjs`
- `docs/R4A_Windows_Release_Readiness_Contract_Audit_2026-07-30.md`

R4A closes the planning gap between the already-built daily-management/basic-editing capabilities and a professional distributable Windows product. It explicitly blocks public release promotion until the project has:

1. real signing evidence,
2. Windows 10/11 VM installation evidence,
3. installer SHA-256 manifest,
4. release notes,
5. rollback plan.

It also preserves the original user requirement boundary:

- daily management and basic editing remain the core product goal;
- Markdown, TXT/JSON/dev formats, PDF sidecar workflows, diagrams/mind maps, XLSX, DOCX/PPTX, and WPS/legacy formats stay under their verified capability contracts;
- user knowledge libraries must never be removed by uninstall;
- only Markdown file associations are currently claimed by the app;
- external-dependency formats such as `doc`, `xls`, `ppt`, `wps`, `et`, and `dps` must not be silently claimed as Windows defaults.

Next recommended stage: R4B. Build the installer evidence bundle shape, including artifact hash manifest schema, unsigned/debug/test-signed/official-signed status separation, and validation that refuses release promotion without matching artifact hashes and signature verification records.

## R4B update - Windows installer artifact manifest

Current stage after this update: R4B is implemented as an installer artifact evidence skeleton. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/windows-release-artifact-manifest.json`
- `scripts/check-r4b-windows-release-artifact-manifest.mjs`
- `docs/R4B_Windows_Release_Artifact_Manifest_Audit_2026-07-30.md`

R4B records the current historical/local installers under `releases/`, verifies their SHA-256 hashes and file sizes, and explicitly marks them as `promotionEligible=false`. This prevents old local installer files from being mistaken for a current signed release.

Current blockers to official release remain:

1. no current release-tag build evidence,
2. no verified code-signing evidence,
3. no Windows 10/11 VM matrix evidence,
4. no release notes,
5. no rollback plan.

Next recommended stage: R4C. Define signature verification evidence and accepted signing-state rules while still keeping `releaseCandidate=false` until real signing and VM evidence are complete.

## R4C update - Windows signing evidence

Current stage after this update: R4C is implemented as a signing-evidence contract. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/windows-release-signing-evidence.json`
- `scripts/check-r4c-windows-release-signing-evidence.mjs`
- `docs/R4C_Windows_Release_Signing_Evidence_Audit_2026-07-30.md`

R4C records the current historical/local installers as `NotSigned` according to PowerShell `Get-AuthenticodeSignature`. Each signing record is linked back to the R4B SHA-256 artifact manifest, and every artifact remains `promotionEligible=false`.

Current release blockers remain:

1. no valid Authenticode signature,
2. no timestamp certificate,
3. no accepted certificate subject,
4. no current release-tag build evidence,
5. no Windows 10/11 VM matrix evidence.

Next recommended stage: R4D. Define the Windows 10/11 VM matrix evidence shape for fresh install, upgrade, downgrade rejection, uninstall retention, file association recovery, and first launch after install.

## R4D update - Windows VM matrix evidence

Current stage after this update: R4D is implemented as a VM evidence contract. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/windows-release-vm-matrix-evidence.json`
- `scripts/check-r4d-windows-release-vm-matrix-evidence.mjs`
- `docs/R4D_Windows_VM_Matrix_Evidence_Audit_2026-07-30.md`

R4D defines the required Windows 10/11 release matrix but does not claim that real VM validation has been completed. Every row is currently `status=missing`, `evidencePath=null`, and `releaseBlocking=true`.

Required Windows targets:

1. `windows-10-x64`,
2. `windows-11-x64`.

Required scenarios per target:

1. fresh install,
2. upgrade from previous version,
3. downgrade rejection,
4. uninstall retains user data,
5. file association recovery,
6. first launch after install.

Next recommended stage: R4E. Define release notes and rollback-plan evidence so the project has a complete final RC promotion checklist before any release-candidate switch is considered.

## R4E update - release notes and rollback plan

Current stage after this update: R4E is implemented as a release-notes and rollback-plan evidence contract. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/windows-release-notes-rollback-plan.json`
- `scripts/check-r4e-windows-release-notes-rollback-plan.mjs`
- `docs/R4E_Windows_Release_Notes_Rollback_Audit_2026-07-30.md`

R4E keeps the original user goal explicit in the release evidence: daily management, basic editing, Markdown/TXT/JSON/dev formats, PDF sidecar workflows, diagrams/mind maps/canvas/OPML, XLSX, DOCX/PPTX, WPS/legacy guarded workflows, and knowledge graph/index/backup/diagnostic management.

The release notes also document current limitations:

1. PDF body-equivalent editing is not supported,
2. WPS native body editing is not supported,
3. legacy binary Office editing depends on compatible Office conversion,
4. historical installers are unsigned and not promotable,
5. Windows VM results are missing,
6. large frontend chunk warnings remain.

Rollback plan evidence now requires backup export, manifest verification, safe uninstall, previous known-good reinstall, path-remapped backup restore, knowledge-index rebuild, and representative file reopen checks.

Next recommended stage: R4F. Create the final RC promotion gate so `releaseCandidate=true` remains impossible until artifacts, signing, VM matrix, release notes, rollback, and data retention all pass.
