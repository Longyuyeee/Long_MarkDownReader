# R3A 知识索引健康与恢复审计

日期：2026-07-30
阶段：R3A
结论：知识索引已经具备可查询状态、损坏识别、损坏快照隔离和安全重建入口；R3 仍未收口，`releaseCandidate=false`。

## 本步目标

R3 的目标不是继续扩展单个格式，而是让“日常管理系统”本身更可靠。R3A 先处理最容易影响体系化管理体验的一点：本地知识索引如果损坏，软件必须能明确识别、隔离旧缓存，并让用户安全重建，而不是卡在损坏状态或要求用户手动清理缓存目录。

## 本步完成

- `KnowledgeIndexStatus` 新增 `recoveryAvailable` 和 `staleSourceCount`，区分 ready、stale、corrupt 与是否可恢复。
- 新增 `KnowledgeIndexRecoveryReport`，返回恢复前后状态、缓存大小、隔离结果和脱敏说明。
- 新增 `recover_index_cache` 服务：只在索引为 `corrupt` 时把 `snapshot.json` 移动为同目录 `snapshot.corrupt.<timestamp>.json`，不删除证据，不读取知识库正文。
- 新增 Tauri 命令 `recover_knowledge_index_cache`。
- Library 侧栏原知识索引条新增“隔离损坏索引”入口，仅在 `corrupt && recoveryAvailable` 时出现；仍在原主窗口右侧/侧栏结构内完成，没有引入新的主界面。
- stale 状态显示当前来源数量，帮助用户判断是否需要重建。
- 新增机器契约 `shared/data-resilience-policy.json` 和 `scripts/check-r3-data-resilience-contract.mjs`，固定 R3A 已实现、R3B/R3C/R3D 仍为 planned，并固定隐私排除项。

## 边界

- R3A 只处理本地知识索引缓存，不导出用户配置、不导入备份、不生成诊断包。
- 隔离文件仍保留在应用缓存的工作区索引目录下，供后续故障分析；不会进入备份包或诊断包。
- 恢复动作不会自动重建索引，用户仍需显式点击重建。
- 备份导出/导入与隐私净化诊断仍属于 R3B/R3C/R3D。

## 验证

- `npm.cmd run build`：通过。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml services::knowledge_index -- --nocapture`：5/5 通过。
- `npm.cmd run check:r3-data-resilience-contract`：通过。
- `rustfmt --edition 2021 --check` 针对本轮 Rust 文件时仍会被仓库既有 `src-tauri/src/formats/pptx.rs` 格式化差异牵连；本轮未修改该历史差异。

## 后续阶段还剩多少

从“全格式支持和收口”的角度，当前还剩 5 个主要阶段：

1. R3B：配置、库清单和应用元数据备份导出。
2. R3C：备份导入、冲突预览、原子恢复和失败回滚。
3. R3D：隐私净化诊断包和泄漏拒绝测试。
4. R4：正式签名与 Windows 10/11 VM 安装生命周期矩阵。
5. F-final：补齐外部证据门禁，主要是 E1B WPS ODT 3/3 和 X3-B6 数组生产者 3/3；若外部环境长期不可用，发布说明必须明确标记为外部证据待补，不得伪造关闭。

下一步直接进入 **R3B：版本化备份导出**。备份包默认只包含配置、库清单、应用元数据和能力合同，不包含文档正文、API Key、完整用户路径或可恢复缓存正文。
