# M1A4B1 XLSX 对象草稿事务基础审计

日期：2026-08-26

状态：通过；下一步 M1A4B2

## 目标与修正前实际

M1A4A 关闭了基础条件格式的交互缺口，但对象操作仍分别调用 `update_workbook_conditional_format` 和 `update_workbook_table` 立即写盘；单元格、格式和合并草稿则使用 `write_workbook_cells`。如果前端只把对象操作排队后依次调用这些命令，第二项失败时第一项已经落盘，无法满足统一保存和整体回滚。

本阶段目标是先建立后端原子边界：一次签名校验，在内存中组合单元格、格式、条件格式和 Table 变更，完整验证后只执行一次可靠写入。前端对象草稿本阶段仍未接入。

## 实现

- 新增 `WorkbookDraftWritePayload`，在既有单元格、样式、行高、列宽和合并草稿之外，接受有序条件格式与 Table 变更。
- 新增 Tauri 命令 `write_workbook_draft`：复核工作区路径与内容签名，在内存中应用全部补丁，检查 128 MB 上限和 OOXML 包结构，最后只调用一次 `write_bytes`。
- 既有立即写盘命令暂时保留，供 M1A4B2 前端迁移前兼容；当前不能宣称对象显式保存已完成。

## 真实测试

Rust 测试生成真实临时 XLSX，并在一次事务中完成：

- 将 `进度!B2` 从 `75` 改为 `88`；
- 新建 `greaterThan 80` 的绿色条件格式；
- 新建 `ProgressTable`。

写入后使用真实工作簿引擎复读，三项结果全部存在且文件字节变化。随后使用旧签名重放完全相同的事务，命令明确拒绝，失败前后文件字节完全一致。既有条件格式签名保护测试也继续通过。

验证命令：

- `cargo test --locked --manifest-path src-tauri/Cargo.toml writes_cell_conditional_format_and_table_drafts_in_one_transaction -- --nocapture`
- `cargo test --locked --manifest-path src-tauri/Cargo.toml writes_conditional_formats_with_signature_protection -- --nocapture`
- `npm run audit:post-v115-m1a4b1-xlsx-object-transaction`

## 结论与下一步

M1A4B1 只关闭“后端能否整体保存”的风险，不关闭 M1A4B。下一步 M1A4B2 在 `WorkbookView` 中建立条件格式与 Table 草稿集合，将对象变更纳入现有撤销/重做、脏状态、离开保护和顶部保存按钮，并调用 `write_workbook_draft`。真实桌面必须证明保存前临时源摘要不变、撤销/重做有效、保存后两类对象复开一致、签名冲突不落盘、运行时错误为 0。
