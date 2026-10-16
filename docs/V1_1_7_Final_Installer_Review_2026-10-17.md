# v1.1.7 最终安装器接续

**已完成发布：**同包复核 38950309873、发布与公开回下载 38950993084 均 success；Release 415282808 的标签固定 84cc1ad6。没有重建安装器，README 已更新，当前公开 1.1.7。收据与下一步以[正式发布审计](V1_1_7_Unsigned_Community_Release_Audit_2026-10-16.md)为准，下面完整保留各阶段记录，不再作为待办重复执行。

## 最终同包复核已通过

**38950309873 success**，产品、原安装器和驱动身份均与下方登记一致。完整安装态结果已导入 [1.1.7 产物清单](evidence/v1.1.7-release/artifact-manifest.json)，本版 12 项及全部继承流程通过；已实际查看冲突、历史、TXT 恢复和移动图片原图。原构建的导航超时仍保留，不能把不同驱动身份混成不同产品。

此时已达到社区版发布条件，下一步准备标签和 Draft Release，再由发布流程上传**已验收的原字节**、公开回下载核对并更新 README。公开附件核验前，不将“ready”写成“published”。下方“尚在运行”为启动时快照。

## 当前复核运行

[同包复核 38950309873](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38950309873) 已从驱动提交 `23de2567a49ccbe857a9d8a1c76d8d1d05ea472f` 启动，使用构建 **38945853964** 的原安装器、固定产品 **84cc1ad6d4697bb98c17e3396b9d8d65da41847a**，由公开 1.1.6 验证升级。登记时尚在运行，不提前导入为 passed、创建公开 Release 或切换 README 下载。

## 最新：同包复核前修正驱动导航合同

产品仍固定 **84cc1ad6**，main CI 38945852747 已整体 **success**。构建 38945853964 的质量门、完整原生/性能、MSI/NSIS、安装器摘要和此前继承流程通过，但整体 **failure**：首次进入本版流程时，驱动向真实三参数 `navigate(hash, selector, description)` 仅传了路径，等待 `document.querySelector(undefined)` 超时。诊断正文已显示 `方案.md` 和 `original markdown`；不能把它解释为文档未打开或修改产品来迁就脚本。

已补一个统一导航适配器，提供实际 hash、`.library-mode` 就绪目标及描述，四处导航全部复用；TXT 进一步等待原文实际显示再输入。新增驱动回归先失败，修正后与发布/协调检查共 8 项通过。旧的恢复、正文、草稿和 12 项结果断言都保留，没有降低等待标准、跳过场景或替换空结果。

失败原始日志位于 [first-install-failure.log](evidence/v117-installed-closure/first-install-failure.log)，原始/修正回归位于 [导航驱动审计](evidence/v117-final-harness-review/)。这是仅驱动修改，`src/`、`src-tauri/`、`shared/` 和包配置与固定产品无差异，故**不重建安装器**；下一步从最新开发分支执行同一安装器的完整独立复核。下面的“正在运行”为此前时间快照。

## 固定身份与当前状态

- 固定产品：**`84cc1ad6d4697bb98c17e3396b9d8d65da41847a`**，已推送 main 与开发分支。运行时 1.1.7，当前公开版仍为 1.1.6。
- [固定源码安装器与生命周期 38945853964](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38945853964)、[main CI 38945852747](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38945852747) 已启动，登记时正在运行；不提前记为通过。
- 该产品包含 [中断备注恢复修正](V1_1_7_Metadata_Recovery_Audit_2026-10-17.md)，本地最终原生 899 通过/0 失败/5 既有 ignored、独立性能及最终质量门通过。旧 `86dbccd1` 安装运行 38940031808 整体失败且产品已被修正取代，不能发布。
- 源码固定后只继续核对事实和加强驱动；若发现实际产品问题，须重新固定、构建，不拿旧字节冒充新代码。仅改验收驱动时，可对同一安装器复核，不能不必要地重建产品。

## 同包复核的额外检查

核对 `runtimeErrorNotice.ts` 与 `App.vue` 后发现，原本本版末尾只检查旧 `.global-error-overlay/.startup-fatal-screen`，会漏掉当前 `#runtime-error-notice` 和 `.route-error-notice`。新增回归先出现 1 失败，再修正为同时覆盖当前及旧提示，连同已有发布/读协调检查共 7 项通过。

这只修改 `scripts/lib/installed-v1-1-7-workflow.mjs` 及其测试，不修改任何产品页面或原生代码，**固定产品仍为 84cc1ad6，不因加强脚本重建安装器**。原始结果保留在 [驱动审计](evidence/v117-final-harness-review/)。本版仍为 12 项安装流程，只加强末项“无全局错误”的检测，没有删掉、改名或放宽原检查。

最终独立复核必须从包含该加强项的开发分支运行 `v1-1-0-installer-review.yml`，输入：原安装构建 run、candidate_commit=84cc1ad6d4697bb98c17e3396b9d8d65da41847a、current_version=1.1.7、previous_version=1.1.6。脚本需要记录自身 harness 提交，但不能把它当作安装器产品提交。

正常失败场景结束后如果出现运行时或路由错误，应调查实际原因，不能清空提示、移除 DOM 或降低断言来过验收。

## 发布前顺序

1. 等待新固定构建真实结果，查看失败或完成报告；构建前端/Rust/安装器成功不代表安装流程成功。
2. 用同一份安装器做独立复核；保留所有继承流程及本版 12 项，含重要版本备注中断的真实磁盘/IPC 检查。
3. 下载较小的复核报告 artifact，实看实际安装版截图；核对产品、安装器及报告 SHA-256，使用现有导入器登记永久证据。
4. 核对固定产品所对应 main CI，再决定发布。README 保留开头图标和介绍，更新记录在末尾；公开附件之前不切换下载。
5. 发布只上传已验收字节，核验公开回下载与摘要；更新交接，下一目标按已批准路线接 1.1.8。

本机 GitHub API 经原本本地代理出现重置/EOF，已验证直连可用；仅对相关子进程移除代理环境设置，没有修改系统代理或全局 Git 设置。旧失败包的 213 MB artifact 下载停滞后已停止，远端仍保留；不以未下载到的原生截图作结论。后续优先取同包复核的小报告包，不重复下载未验收旧安装器。
