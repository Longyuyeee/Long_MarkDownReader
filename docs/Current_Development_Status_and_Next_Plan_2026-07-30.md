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

## R4F update - final RC promotion gate

Current stage after this update: R4F is implemented as the final release-candidate promotion gate. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/windows-release-rc-promotion-gate.json`
- `scripts/check-r4f-windows-release-rc-promotion-gate.mjs`
- `docs/R4F_Windows_RC_Promotion_Gate_Audit_2026-07-30.md`

R4F connects artifact hashes, signing evidence, Windows VM matrix, release notes, rollback plan, data-retention policy, and public capability matrix into one machine-checkable RC gate. Every required evidence row is currently `passed=false` and `releaseBlocking=true`.

R4 contract-layer release readiness is now structurally closed: the project has clear machine-checkable gates, but it is not yet a release candidate because real signed artifacts, VM runs, rollback validation, and manual approval are still missing.

Next recommended stage: R5. Execute real release evidence and product hardening: run the Windows 10/11 VM matrix, decide signing/distribution strategy, validate rollback on real VMs, review frontend chunk splitting, and only then consider a controlled RC switch.

## R5A update - frontend release bundle hardening

Current stage after this update: R5A is implemented as a frontend release-bundle hardening step. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/frontend-release-hardening-policy.json`
- `scripts/check-r5a-frontend-release-hardening.mjs`
- `docs/R5A_Frontend_Release_Bundle_Hardening_Audit_2026-07-30.md`
- `vite.config.ts`

R5A aligns release hardening with the original product goal: this is no longer just a Markdown reader, so PDF, knowledge graph, diagrams/mind maps, OCR, workbook, Office-like workflows, and code/dev editing have real frontend weight. The Vite build now separates these heavy capability domains into explicit chunks and uses an audited `chunkSizeWarningLimit` budget instead of leaving large chunks as unexplained build noise.

Current status: `chunk-domains-defined-budget-under-review`.

Next recommended stage: R5B. Add desktop startup/performance evidence shape or run a local smoke measurement if the environment supports it.

## R5B update - desktop startup and route performance evidence

Current stage after this update: R5B is implemented as a desktop startup and route-performance evidence foundation. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/desktop-startup-performance-policy.json`
- `scripts/check-r5b-desktop-startup-performance.mjs`
- `docs/R5B_Desktop_Startup_Performance_Audit_2026-07-30.md`
- `src/App.vue`

R5B keeps the original requirement centered on daily management and basic editing across many formats. Because the system now includes PDF, workbook, diagrams, mind maps, knowledge graph, Office/WPS-like flows, and TXT/JSON/dev editors, route responsiveness has become a release-quality requirement.

The app now records lightweight route transition evidence through `performance.mark`, `performance.measure`, and a bounded `window.__LONGEDIT_ROUTE_PERFORMANCE__` buffer. This gives the next desktop smoke test a concrete data source instead of relying only on subjective UI feel.

Current status: `runtime-marks-added-real-desktop-baseline-pending`.

Next recommended stage: R5C. Add a repeatable desktop smoke-audit capture path that opens a production build, navigates representative routes, exports route performance evidence, and stores the result under `docs/evidence/`.

## R5C update - route performance smoke capture path

Current stage after this update: R5C is implemented as a repeatable route-performance smoke capture path. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5c-route-performance-smoke-policy.json`
- `scripts/capture-r5c-route-performance-evidence.mjs`
- `scripts/check-r5c-route-performance-smoke.mjs`
- `docs/R5C_Route_Performance_Smoke_Capture_Audit_2026-07-30.md`
- `src/App.vue`

R5C turns the R5B route performance marks into exportable evidence. A real desktop/webview run can call `window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__()`, save the JSON, and normalize it through `npm run audit:r5c-route-performance-smoke -- <json>`.

This continues to align with the original user requirement: the app must feel like one professional daily-management system across Markdown, TXT/JSON/dev formats, PDF, workbook, diagrams, mind maps, knowledge graph, and Office/WPS-like workflows. The capture path makes route responsiveness auditable without collecting user document content.

Current status: `capture-path-defined-real-evidence-pending`.

Next recommended stage: R5D. Capture and attach a real route-performance evidence bundle from a built desktop artifact, then decide whether further lazy-loading or UI simplification is needed before release-candidate promotion.

## R5D update - production route smoke preflight

Current stage after this update: R5D is implemented as a production build route-smoke preflight. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5d-production-route-smoke-preflight-policy.json`
- `scripts/audit-r5d-production-route-smoke-preflight.mjs`
- `scripts/check-r5d-production-route-smoke-preflight.mjs`
- `docs/R5D_Production_Route_Smoke_Preflight_Audit_2026-07-30.md`
- `docs/evidence/r5d-production-route-smoke-preflight/manifest.json`
- `docs/evidence/r5d-production-route-smoke-preflight/route-assets.json`

R5D scans the current production `dist/` output and confirms that the runtime route-performance export token is present and that representative right-side workspace route assets exist for workspace, library, TXT, JSON, PDF, workbook, diagram, mind map, graph, canvas, and release capability surfaces.

This keeps the original user requirement in scope: the product must remain a coherent professional management system across daily management, basic editing, PDF, Office/WPS-like flows, knowledge graph, diagrams, mind maps, and developer-friendly formats.

Current status: `production-dist-preflight-supported-real-desktop-run-pending`.

Next recommended stage: R5E. Run a real desktop/webview smoke capture using `window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__()` from a built artifact and compare it against the R5D preflight asset list.

## R5E update - browser-preview runtime route smoke blocker audit

Current stage after this update: R5E is implemented as a browser-preview runtime route smoke blocker audit. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5e-runtime-route-smoke-policy.json`
- `scripts/check-r5e-runtime-route-smoke.mjs`
- `docs/R5E_Runtime_Route_Smoke_Audit_2026-07-31.md`
- `docs/evidence/r5e-runtime-route-smoke/manifest.json`
- `docs/evidence/r5e-runtime-route-smoke/route-performance-evidence.json`
- `src/App.vue`

R5E fixes the first smoke-test blocker discovered during local production preview: browser preview does not expose Tauri internals, so App-level desktop-only event registration is now guarded by `isTauriRuntime()`.

The follow-up smoke run also exposed a deeper blocker: store/page-level code still calls Tauri APIs directly in browser preview. The evidence is intentionally recorded as blocked rather than passed.

Current status: `browser-preview-runtime-smoke-blocked-by-tauri-api-dependencies`.

Next recommended stage: R5F. Add a centralized safe Tauri adapter or preview runtime shim so browser-preview smoke can mount representative routes without directly requiring Tauri internals.

## R5F update - centralized safe Tauri runtime boundary

Current stage after this update: R5F is implemented and the app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5f-safe-tauri-runtime-policy.json`
- `scripts/check-r5f-safe-tauri-runtime.mjs`
- `docs/R5F_Safe_Tauri_Runtime_Audit_2026-07-31.md`
- `docs/evidence/r5f-safe-tauri-runtime/manifest.json`
- `docs/evidence/r5f-safe-tauri-runtime/route-mount-evidence.json`
- `src/services/tauriRuntime.ts`

R5F centralizes runtime detection, typed unavailable-runtime errors, and preview-safe event registration. Configuration loading no longer calls desktop APIs in browser preview, while Library focus/drag-drop listeners remain active in the real Tauri desktop runtime.

The production browser-preview smoke now passes all eleven representative right-side workspace routes: workspace, library, TXT, JSON, PDF, workbook, Mermaid diagram, OPML mind map, knowledge graph, JSON Canvas, and release capability governance.

Current status: `browser-preview-route-mount-smoke-passed-desktop-io-pending`.

This evidence proves integrated route mounting, not native file I/O or signed Windows artifact behavior.

Next recommended stage: R5G. Capture a real built Tauri desktop smoke bundle with representative file open/save operations and route-performance export, then continue the existing signing, Windows VM, rollback, and RC approval gates.

## R5G update - current desktop artifact I/O and route smoke

Current stage after this update: R5G is implemented and the app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5g-desktop-artifact-smoke-policy.json`
- `scripts/run-r5g-desktop-artifact-smoke.ps1`
- `scripts/capture-r5g-desktop-artifact-smoke.mjs`
- `scripts/check-r5g-desktop-artifact-smoke.mjs`
- `docs/R5G_Desktop_Artifact_Smoke_Audit_2026-07-31.md`
- `docs/evidence/r5g-desktop-artifact-smoke/`

R5G built the current optimized `0.7.0` Tauri executable and recorded its SHA-256 hash. A current Debug executable built from the same source then ran in a real isolated Tauri WebView2 process and completed TXT plus JSON read/edit/save/reopen checks.

The real desktop run also mounted all eleven representative right-side workspace routes and exported the route-performance buffer. No user document content was included.

Current status: `current-release-built-debug-desktop-io-smoke-passed-signed-artifact-pending`.

The optimized Release executable was built but not runtime-smoked because an installed user instance already owned the production single-instance channel. R5G deliberately preserves that session and does not claim signed or installed-artifact proof.

Next recommended stage: R5H. Build current MSI/NSIS installers, refresh hashes and Authenticode evidence, and run installed-artifact smoke in an isolated Windows environment before Windows 10/11 VM and rollback closure.

## R5H update - current MSI/NSIS build and signature evidence

Current stage after this update: R5H is implemented and the app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5h-current-installer-evidence-policy.json`
- `scripts/capture-r5h-current-installer-evidence.ps1`
- `scripts/check-r5h-current-installer-evidence.mjs`
- `docs/R5H_Current_Windows_Installer_Evidence_Audit_2026-07-31.md`
- `docs/evidence/r5h-current-installers/installer-artifact-manifest.json`

R5H built the current `0.7.0` MSI and NSIS installers and recorded their exact byte sizes, SHA-256 hashes, UTC build times, and Authenticode results. Both artifacts are local engineering outputs and are intentionally not committed.

This closes the current installer-build evidence gap for the original professional daily-management goal across Markdown, TXT/JSON/developer formats, PDF, workbook, diagrams, mind maps, knowledge graph, canvas, and Office/WPS-like workflows.

Current status: `current-msi-nsis-built-hashed-unsigned-install-smoke-pending`.

Both installers currently report `NotSigned`. No install, upgrade, uninstall, rollback, Windows VM, or signed-artifact runtime claim is made.

Next recommended stage: R5I. Run fresh-install, launch, representative route, TXT/JSON save/reopen, controlled upgrade, uninstall, and rollback smoke in an isolated Windows environment without touching the user's active installation.

## R5I update - isolated installer lifecycle preflight and runner

Current stage after this update: R5I has a complete safe preflight and disposable Windows lifecycle runner. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5i-isolated-install-lifecycle-policy.json`
- `scripts/audit-r5i-isolated-install-environment.ps1`
- `scripts/run-r5i-isolated-install-lifecycle.ps1`
- `scripts/new-r5i-windows-sandbox-config.ps1`
- `scripts/check-r5i-isolated-install-lifecycle.mjs`
- `docs/R5I_Isolated_Windows_Install_Lifecycle_Audit_2026-07-31.md`
- `docs/evidence/r5i-isolated-install-lifecycle/environment-audit.json`

The current host has a registered LongEdit `0.6.9` installation and an active product process. Windows Sandbox, VMware, VirtualBox, and QEMU runners are unavailable. Docker is present only as a Linux context and cannot test a Windows WebView2 desktop installer.

R5I therefore refuses host installation mutation. It now provides a guarded disposable-machine runner for previous-version fresh install, controlled `0.6.2 → 0.7.0` upgrade, first launch, silent uninstall, and user-data retention. A Windows Sandbox configuration generator maps source read-only and only the evidence directory writable.

Current status: `isolated-lifecycle-runner-ready-host-execution-blocked`.

No lifecycle result, installed-artifact route smoke, Windows 10/11 matrix, signature, or RC claim is made.

Next recommended stage: R5J. Execute the R5I bundle in Windows Sandbox or a disposable Windows 11 VM, capture the lifecycle result, add installed-artifact right-side route and TXT/JSON save/reopen evidence, then repeat the final matrix on Windows 10.

## R5J update - installed artifact right-side workspace smoke

Current stage after this update: R5J has implemented and integrated the installed-artifact workspace smoke. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5j-installed-artifact-smoke-policy.json`
- `scripts/audit-r5j-installed-artifact-smoke-preflight.mjs`
- `scripts/capture-r5j-installed-artifact-smoke.mjs`
- `scripts/check-r5j-installed-artifact-smoke.mjs`
- `scripts/run-r5i-isolated-install-lifecycle.ps1`
- `scripts/new-r5i-windows-sandbox-config.ps1`
- `docs/R5J_Installed_Artifact_Workspace_Smoke_Audit_2026-07-31.md`
- `docs/evidence/r5j-installed-artifact-smoke/preflight.json`

The disposable lifecycle runner now launches the actually installed current executable after a controlled upgrade. It performs TXT and JSON read/edit/save/reopen inside the shared right-side Library workspace, mounts eleven representative product routes, rejects the global crash fallback, exports route-performance evidence, captures screenshots, and hashes the installed executable.

The Sandbox generator maps a known Node runtime and the repository read-only; only the evidence output is writable. The smoke uses fixed guest-only fixtures and includes no user document content.

Current status: `installed-smoke-runner-ready-disposable-execution-pending`.

The current host still has no disposable Windows runner, so no guest evidence or RC claim is made.

Next recommended stage: R5K. Execute and import the integrated R5I/R5J bundle on disposable Windows 11, then complete the corresponding Windows 10 install, upgrade, route, I/O, uninstall, retention, downgrade, association, and rollback matrix.

## R5K update - Windows lifecycle matrix and portable evidence handoff

Current stage after this update: R5K has implemented the remaining disposable lifecycle scenarios and a strict portable evidence handoff. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5k-windows-matrix-handoff-policy.json`
- `scripts/audit-r5k-windows-matrix-preflight.mjs`
- `scripts/export-r5k-windows-evidence-bundle.ps1`
- `scripts/import-r5k-windows-evidence-bundle.ps1`
- `scripts/test-r5k-windows-evidence-bundle-rejections.ps1`
- `scripts/check-r5k-windows-matrix-handoff.mjs`
- `scripts/run-r5i-isolated-install-lifecycle.ps1`
- `docs/R5K_Windows_Matrix_Evidence_Handoff_Audit_2026-07-31.md`
- `docs/evidence/r5k-windows-matrix/preflight.json`

The disposable runner now adds Markdown OpenWith registration/removal, controlled downgrade safety, rollback installation of `0.6.2`, rollback launch, cleanup, and retained-data checks. Because the historical `0.6.2` installer predates the current downgrade-rejection policy, the runner truthfully accepts either direct rejection or detection followed by an automatic reinstall of the verified `0.7.0` binary; the future signed Windows 10/11 release matrix still requires strict downgrade rejection between policy-aware installer generations.

R5K originally defined a fixed seven-member ZIP bound to the exact source commit, R5H installer digest, file sizes and digests, application version, non-identifying Windows machine class, and no-user-content boundary. R5L extends the same exact-member contract to eight members with a sanitized management rollback receipt.

The importer rejects path traversal, duplicates, extras, source drift, installer drift, digest drift, incomplete checks, missing routes, invalid screenshots, privacy drift, and overwrite. Four malformed bundle cases pass the rejection matrix without creating imported evidence.

Current status: `matrix-runner-and-evidence-handoff-ready-disposable-results-pending`.

No real disposable Windows evidence has been imported, so Windows 10/11, full backup/restore rollback, signing, and RC gates remain blocked.

Next recommended stage: R5L. Execute and import the Windows 11 bundle, fix any guest-only defects, then run Windows 10 and extend rollback evidence through management-backup restore and knowledge-index recovery.

## R5L update - management backup, index recovery, and rollback closure

Current stage after this update: R5L has integrated the management-system recovery path into the disposable installed-artifact lifecycle. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5l-management-rollback-closure-policy.json`
- `scripts/capture-r5l-management-rollback-smoke.mjs`
- `scripts/audit-r5l-management-rollback-preflight.mjs`
- `scripts/check-r5l-management-rollback-closure.mjs`
- `scripts/run-r5i-isolated-install-lifecycle.ps1`
- `docs/R5L_Management_Backup_Index_Rollback_Audit_2026-07-31.md`
- `docs/evidence/r5l-management-rollback/preflight.json`

The audit corrected an installed-release setup defect: the former smoke relied on a debug-only environment override. The disposable guest now writes a formal isolated `config.json`, and the installed application must load its fixed library and saved search before evidence is accepted.

The lifecycle exports a redacted management backup, validates its privacy boundary and required path mapping, deletes and rebuilds the knowledge index, completes uninstall and previous-version rollback, deliberately replaces the live configuration, reinstalls the current artifact, restores the backup, rebuilds the index, and reopens saved TXT/JSON fixtures in the right-side workspace. A final uninstall must retain the restored configuration and external library.

Only the sanitized `management-backup-index-evidence.json` receipt enters the fixed eight-member evidence bundle. The backup ZIP stays inside the disposable guest.

Current status: `management-rollback-runner-ready-disposable-execution-pending`.

No Windows 10/11 guest result has been imported, so management rollback and index recovery remain unproven at runtime and no RC claim is made.

Next recommended stage: R5M. Execute/import the integrated Windows 11 evidence, repair guest-only defects, repeat on Windows 10, then close signing/runtime trust and final RC promotion gates.

## R5M update - dual Windows lanes, signed runtime, and final fail-closed gate

Current stage after this update: R5M has implemented the final evidence topology and signed-runtime gate. The app still remains `releaseCandidate=false`.

New source of truth:

- `shared/r5m-final-release-closure-policy.json`
- `shared/r5m-manual-release-approval-contract.json`
- `scripts/import-r5m-windows-matrix-evidence.ps1`
- `scripts/test-r5m-windows-lane-rejection.ps1`
- `scripts/audit-r5m-final-release-readiness.ps1`
- `scripts/check-r5m-final-release-closure.mjs`
- `docs/R5M_Final_Release_Closure_Audit_2026-07-31.md`
- `docs/evidence/r5m-final-release/preflight.json`

The former single imported-evidence destination could not represent both supported Windows versions. R5M adds independent `windows-10-x64` and `windows-11-x64` lanes, validates the OS class from the reported Windows build number, and rejects wrong-lane promotion without creating an evidence directory.

The disposable lifecycle now also supports `-RequireSignedArtifact`. Signed mode requires valid Authenticode, signer and timestamp certificates, exports only certificate SHA-256 fingerprints, and propagates the signed-runtime result through the lifecycle, installed smoke, portable bundle, and importer.

The final audit checks current artifact hashes/signatures, both Windows lanes, signed runtime in both lanes, and manual approval. The present audit finds matching current hashes but both artifacts are `NotSigned`, both OS lanes are missing, and approval is absent.

Current status: `dual-lane-import-and-final-audit-ready-external-evidence-pending`.

No installer was executed on this host and no release claim is made.

Next recommended stage: R5N. Execute/import Windows 10 and Windows 11 evidence, obtain approved signing material, refresh hashes after signing, rerun both signed lanes, and record explicit manual release approval before promotion.

## R5N update - signed release execution handoff

Current stage after this update: R5N has completed the repository-side signed release handoff while keeping the application `releaseCandidate=false`.

New source of truth:

- `shared/r5n-external-release-execution-policy.json`
- `scripts/audit-r5n-external-release-environment.ps1`
- `scripts/capture-r5n-signed-installer-manifest.ps1`
- `scripts/import-r5n-signed-windows-evidence.ps1`
- `scripts/audit-r5n-release-promotion-readiness.ps1`
- `scripts/new-r5n-manual-release-approval.ps1`
- `scripts/test-r5n-release-closure-rejections.ps1`
- `scripts/check-r5n-external-release-execution.mjs`
- `docs/R5N_External_Release_Execution_Handoff_Audit_2026-07-31.md`
- `docs/evidence/r5n-external-release/environment-audit.json`
- `docs/evidence/r5n-release-promotion/preflight.json`

R5N separates signed Windows 10/11 results from unsigned engineering lanes, binds guest execution and import to an explicit signed artifact manifest, requires Authenticode plus timestamp certificates, and blocks approval until the signed manifest and both signed runtime lanes pass.

The current host has a running `vmcompute` service but no Windows Sandbox or Hyper-V provisioning command, no Windows SDK `signtool.exe`, no eligible code-signing certificate, and no provided disposable Windows 10/11 runner. Signed artifacts, signed runtime evidence, and approval are therefore absent.

Current status: `external-release-handoff-ready-environment-and-evidence-blocked`.

Next action: `external-release-execution`. Provision the two Windows runners and signing material, then follow the R5N execution order. No repository-only change can truthfully substitute for those external results.

## 2026-07-31 comprehensive audit index

The initial product goals, current 39-format capability boundary, unified workspace, knowledge graph and mind-map maturity, release blockers, and staged closure plan have been consolidated in:

- `docs/Current_Development_Audit_and_Next_Plan_2026-07-31.md`

Audit conclusion: daily management, basic editing, and systematic knowledge organization are materially implemented at the engineering-feature level. The product remains `releaseCandidate=false` because signed Windows 10/11 installed-runtime evidence and manual release approval are still missing.

Next action remains `external-release-execution`. Product enhancements may proceed in parallel, but they must not be reported as a substitute for the R5N signed runtime closure.

## U2O update - hosted unsigned lifecycle and management recovery closed

GitHub Actions run `30664431101` rebuilt source `dfe5e9c424ab4a3b71f1eee3924dc43f8f7d400f` and passed the complete unsigned installed lifecycle on Microsoft Windows Server 2025. The imported bundle is bound to the source commit and installer digest. All 18 lifecycle checks passed, including installed TXT/JSON save-reopen, file-association recovery, rollback, management backup restore, knowledge-index rebuild, and retained data. Manual screenshot review confirmed both editors remain visible in the Library right-side workspace.

R5K is now `generic-hosted-windows-evidence-imported-client-matrix-pending`; R5L is `generic-hosted-management-recovery-proven-client-matrix-pending`; U2 is `hosted-unsigned-lifecycle-passed-signed-client-matrix-pending`. This closes the generic hosted unsigned lane only. Windows 10, Windows 11, Authenticode signing, signed runtime, and manual release approval remain false, so `releaseCandidate=false` remains unchanged.

Next action: R5N `execute-signed-windows-10-and-windows-11-client-matrix`. Full evidence and boundary analysis are in `docs/U2O_Hosted_Unsigned_Lifecycle_Closure_Audit_2026-08-01.md`.

## U2P update - repository automation closed at the R5N external boundary

The R5N environment and promotion audits were rerun after U2O. The host has no Windows SDK signing tool, no eligible code-signing certificate with a private key, no Windows Sandbox or Hyper-V provisioning command, and no provided Windows 10/11 disposable clients. Signed manifest readiness, both signed client lanes, automated promotion gates, and manual approval therefore remain false. The 3/3 unsafe-transition rejection matrix passed.

Repository-only progression is now closed at a genuine external dependency boundary. The exact signing, dual-client execution, import, approval, and explicit-promotion order is documented in `docs/U2P_R5N_External_Release_Blocker_Audit_2026-08-01.md`.

## G9 update - knowledge network pulse

The product track continues independently of the blocked signing track. Workspace Home now exposes a knowledge network pulse with connected-object coverage, connected and isolated counts, relation totals, deterministic relation-type distribution, and up to six top connected topics. Each topic opens a graph centered on that knowledge object; an empty network presents a concrete link/tag/canvas onboarding action.

The backend computes these values from the unified graph model and has Rust coverage for a four-object, three-relation fixture with 75% coverage. `check:graph-product-contract` now includes the G9 machine contract. Frontend production build, 432/432 Rust functional tests, 1/1 performance test, the full format contract, and the graph product contract pass. Current status is `knowledge-network-pulse-implemented-real-library-acceptance-next`; `releaseCandidate=false` and all R5N external blockers remain unchanged.

Next product stage: G10. Capture isolated desktop evidence on a representative cross-format library and evaluate whether relation coverage, top topics, and navigation provide useful management feedback. Full audit: `docs/G9_Knowledge_Network_Pulse_Audit_2026-08-01.md`.

## G10 update - representative cross-format knowledge network acceptance

G10 now validates the knowledge network against files written to an isolated real filesystem instead of a hand-built graph. One representative library covers Markdown, PDF annotations, table views, Canvas nodes, OPML outline nodes, and a real-producer PPTX fixture. The resulting pulse must contain 11 object types, five management relation types, at least 16 objects and 12 relations, at least 75% relation coverage, more connected than isolated objects, and a ranked top-topic list bounded to six entries.

This is deterministic synthetic-content integration evidence, not a real user library and not installed-artifact UI evidence. Current status is `representative-cross-format-library-pulse-accepted-installed-observation-next`; `releaseCandidate=false` and the R5N signing/Windows 10/11 blockers remain unchanged.

Next product stage: G11. Exercise the same knowledge pulse and centered graph navigation inside the disposable installed-artifact lifecycle, while preserving the synthetic evidence label. Full audit: `docs/G10_Cross_Format_Knowledge_Network_Acceptance_Audit_2026-08-01.md`.

## G11 update - installed knowledge pulse runner integrated

The disposable installed-artifact lifecycle now creates a fixed synthetic Markdown/Canvas relation network. The installed Workspace Home must expose non-zero useful coverage, `depends-on` and `supports` relations, and ranked topics; clicking the first topic must open the graph with matching selected object identity and a `root` route. Stable non-visual test attributes and three redacted evidence outputs have been added.

Current status is `installed-knowledge-pulse-runner-integrated-hosted-execution-next`: source integration is complete, but no hosted run for the current commit has yet been accepted. `releaseCandidate=false` remains unchanged. Next action: trigger the U2 hosted lifecycle for the current commit, inspect/import the G11 outputs, then close G11 in a separate audit push.

## G11 closure - hosted installed knowledge pulse passed

GitHub Actions run `30689117409` reused the installer built from product commit `634c98f` and passed the complete disposable installed lifecycle with the corrected evidence timing. Workspace Home showed 5 objects, 6 relations, 5 connected objects, 0 isolated objects, 100% coverage, four relation types, and five ranked topics. Topic identity remained stable through centered graph navigation. Manual screenshot review confirmed both the pulse and selected-node graph were visible with no route loading overlay.

Current product status is `hosted-installed-knowledge-pulse-passed-real-user-observation-next`. This proves the synthetic installed-artifact experience on Microsoft Windows Server 2025, not a real user library and not signed Windows 10/11 clients. `releaseCandidate=false` remains unchanged. Next product stage: G12 consented real-library observation design; release action remains R5N external signing and dual-client execution.

## G12 update - consented aggregate knowledge observation

Settings now provides a preview-first, explicit-confirmation local export for real-library knowledge-network observation. The JSON contains only counts, coverage, object/relation type distributions, and degree buckets. Document content, file names, object IDs, absolute paths, library names, saved searches, credentials, and raw errors are excluded; the app never uploads the receipt automatically and refuses to overwrite an existing file.

The privacy regression deliberately constructs a graph with secret titles, identifiers, and Windows paths and verifies none survive serialization. Current status is `consented-aggregate-observation-export-implemented-user-execution-next`: implementation is complete, but no real-user observation is claimed until the user explicitly runs and shares an inspected aggregate receipt. `releaseCandidate=false`; R5N signing and Windows 10/11 client evidence remain required before 1.0.0 or updater work.

## G13 update - actionable local knowledge guidance

Knowledge-network metrics now produce deterministic aggregate-only guidance instead of ending at passive counts. Workspace Home presents the highest-priority action inside the existing knowledge pulse and opens the unified graph workspace; the consented preview and local receipt carry the same stable guidance codes, priorities, current values, and targets.

Rules cover empty, disconnected, low-coverage, isolated, low-diversity, and healthy networks. They use no content, file names, object identifiers, paths, model calls, network requests, or automatic uploads. Rust tests cover the decision thresholds and extend the G12 leakage boundary. Current status is `actionable-local-guidance-implemented-real-user-execution-next`; real-user execution remains consent-gated and `releaseCandidate=false` remains unchanged.

## G14 update - installed actionable guidance runner integrated

The U2 installed-artifact capture now requires the fixed synthetic management library to expose `network-health-on-track`, a visible healthy-state label, and current-window navigation from the guidance card into the unified graph route. It then returns to Workspace Home and preserves the existing centered-topic navigation acceptance.

Current status is `installed-actionable-guidance-runner-integrated-hosted-execution-next`. The hosted run and screenshot review are deliberately still false until executed against G13 product commit `068d3bd`; this remains synthetic unsigned Windows Server evidence, not real-user or signed Windows 10/11 evidence. `releaseCandidate=false` remains unchanged.

## G14 closure - hosted installed actionable guidance passed

GitHub Actions run `30690425501` rebuilt product commit `068d3bd` and exercised orchestration commit `cc9c549` through the complete disposable lifecycle. The installed Workspace Home rendered `network-health-on-track` for the 5-object, 6-relation, 100%-coverage synthetic network; clicking the guidance opened `#/graph` in the current application window. All 8 installed smoke checks and 18 lifecycle checks passed.

Manual screenshot review confirmed the guidance card is readable and aligned with the existing workspace style, and the destination contains the real graph and node detail without a loading overlay or unexpected window. Current status is `hosted-installed-actionable-guidance-passed-real-user-observation-next`. The accepted receipt is sanitized; original screenshots remain in the Actions artifact. G15 remains user-consented real-library observation, while R5N signing and Windows 10/11 evidence still block release.

## G15A update - guided remediation routing

The installed G14 evidence proved that guidance opens the graph in the current window, but also exposed that every guidance code used the same generic destination. G15A now maps the six stable codes to specific management contexts: first-object guidance opens the library; first-relation guidance opens the link tutorial; coverage and isolation guidance temporarily focus orphan objects and open governance; diversity guidance explains semantic relation actions; healthy guidance opens the network overview.

The `focus` query is bounded, orphan focus is ephemeral, persisted graph filters and user content are not mutated, and the banner can restore the normal graph route. Current status is `guided-remediation-routing-implemented-real-user-execution-next`; G15 remains the consent-gated real-library observation and `releaseCandidate=false` remains unchanged.

## G15B update - consented guidance outcome comparison

The consented observation flow now supports a privacy-preserving baseline and follow-up comparison. A user saves a previewed aggregate baseline, performs a guided remediation, selects that baseline again, reviews coverage, isolation, connected-object, relation, and relation-type changes, and explicitly chooses whether to save a new local comparison receipt.

The backend accepts only a valid G12 aggregate-only baseline, caps input at 1 MiB, rejects any privacy flags that indicate content, identifiers, file names, or paths, and creates rather than overwrites the result. The comparison contains no library fingerprint and performs no upload, so the user must explicitly confirm that the selected baseline belongs to the current library. Current status is `consented-guidance-outcome-comparison-implemented-user-execution-next`; no real-user outcome is claimed and `releaseCandidate=false` remains unchanged.

Next product action: `G15-consented-real-library-baseline-remediation-follow-up`. The user selects a real library, saves and inspects a baseline, performs one recommended action, then reviews and optionally shares the inspected aggregate comparison. Release action remains independently blocked at R5N signing, signed Windows 10/11 client execution, and manual approval.

## G15C update - installed guidance outcome runner integrated

The disposable installed WebView2 lifecycle now covers the G15B baseline and follow-up path. It mounts the existing Settings surface in the current application window, verifies both observation actions, exports a G12 aggregate baseline through the installed Tauri command, adds one fixed linked Markdown object to the synthetic library, previews and exports the G15B comparison, and rejects any receipt containing fixture paths, file names, or titles.

Current status is `installed-guidance-outcome-runner-integrated-hosted-execution-next`. The runner contract is complete, but hosted execution and screenshot review remain false until U2 builds and exercises product source `fffbc6af4508b6476610a5b34d704ac606efe2ee`. This is synthetic installed-artifact evidence only; it does not replace consented real-library execution, signed Windows 10/11 evidence, or manual release approval. `releaseCandidate=false` remains unchanged.

The first hosted attempt, run `30692454820`, built both installers successfully but failed before G15C because the startup configuration redirect replaced the runner's first TXT deep link with `#/workspace`. The runner now waits for a stable Workspace Home plus mounted knowledge pulse before route testing. G15C itself did not execute in the failed attempt; its hosted and screenshot gates remain false. The retry may safely reuse the two installers from that run because the fixed product source is unchanged and only the orchestration runner was repaired.

The repaired run `30693531173` passed all installed lifecycle checks and executed G15C: objects changed 5→6, relations 6→7, connected objects 5→6, coverage stayed 100%, and the aggregate outcome was `improved` with all privacy flags false. Functional installed execution is accepted. Manual screenshot review found that the Settings capture remained at the top of the page and did not visibly include the observation controls, so screenshot review remains false. The runner now scrolls the target row into the viewport and verifies its rendered bounds before recapture; current status is `installed-guidance-outcome-functional-passed-visual-recapture-next`.

## G15C closure - hosted installed guidance outcome passed

Visual recapture run `30693694231` passed 9/9 installed smoke checks and all 18 lifecycle checks. The installed Settings page showed the complete knowledge-observation row inside the viewport, with readable baseline/follow-up actions aligned to the existing management and diagnostic controls. Manual screenshot review is accepted.

The aggregate synthetic result remained 5→6 objects, 6→7 relations, and 5→6 connected objects with outcome `improved`; no content, identifiers, file names, or absolute paths entered the receipt. Current status is `hosted-installed-guidance-outcome-passed-real-user-follow-up-next`. G15C closes installed synthetic product preparation, while G15 consented real-library execution and R5N signed Windows 10/11 release evidence remain pending. `releaseCandidate=false` is unchanged.

## G15D update - discoverable baseline and follow-up entries

The post-G15C audit found that the consented outcome workflow was technically complete but still hidden in Settings. Workspace Home now exposes `记录治理基线` beside the active knowledge guidance, while every graph remediation banner exposes `复查改善`. Both use the current application window and the bounded `Settings?focus=knowledge-observation` route.

Settings recognizes only that focus value, scrolls the existing observation row into view, and highlights it with existing theme tokens. Navigation never starts an export, chooses a file, bypasses preview/confirmation, or uploads evidence. Current status is `guidance-observation-entry-implemented-installed-navigation-next`; installed navigation evidence and real-user execution remain false, and `releaseCandidate=false` is unchanged.

G15D now also has an installed navigation runner. It clicks both the Workspace baseline entry and graph follow-up entry, requires the focused Settings route and visible target bounds in the same window, captures each destination, and records `exportTriggered=false`. Current status is `installed-observation-entry-runner-integrated-hosted-execution-next`; the product source is fixed at `80df4a65a03d2640841efd0d2d9111f61a00fafa`, while hosted execution and screenshot review remain pending.

## G15D hosted functional pass and visual recapture gate

U2 run `30694114591` passed the installed smoke matrix (`10/10`) and full install/upgrade/rollback lifecycle (`18/18`). Both observation entries reached the focused Settings destination in the current application window without triggering export. Manual screenshot review rejected the visual evidence because both captures still showed the Settings route-loading transition instead of the focused observation row. The functional evidence is accepted, but the installed-navigation closure remains false. The runner now waits for the loader to disappear, two paint frames, and a further 500ms stable visible target before capture. Next step: reuse run `30694114591` installers for a visual recapture; release, signed-client, and real-user-library claims remain false.
