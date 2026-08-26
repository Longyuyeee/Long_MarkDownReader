# M1A4B2 XLSX 对象草稿与显式保存审计

日期：2026-08-26

状态：通过；M1A4 与 M1A 收口，下一步 M1B0

## 目标与修正前实际

M1A4B1 已建立单元格、条件格式和 Table 的后端原子事务，但 `WorkbookView` 中条件格式与 Table 仍分别立即写盘，不能与单元格草稿共享撤销、重做、脏状态、离开保护和顶部保存按钮。

本阶段把受支持的条件格式与 Table 操作改为纯内存对象草稿，并在用户点击顶部“保存”时一次调用 `write_workbook_draft`。高级或无法证明保持的对象边界没有扩大。

## 实现

- 新增有序 `objectDrafts`，条件格式与 Table 变更只加入草稿，并明确提示“点击顶部保存后写入文件”。
- 对象草稿计入保存数量、状态栏、离开保护和放弃重载；现有撤销/重做栈可恢复整组对象草稿快照。
- 顶部保存一次提交单元格、样式、尺寸、合并、条件格式与 Table 载荷，成功后统一清空草稿并重读当前 Sheet。
- 后端补齐纯对象事务：没有单元格改动时直接从源包开始应用对象补丁，不再误报“没有需要保存的单元格变更”。

真实测试过程中先后发现并修正两项实际差异：Vue 响应式 Proxy 不能直接交给 `structuredClone`，改为纯 JSON 协议克隆；纯对象事务被单元格补丁的空变更门禁拒绝，改为允许对象独立保存并新增 Rust 回归测试。

## 真实测试

隔离 Tauri WebView2 使用仓库真实 `compatibility-baseline.xlsx` 副本完成：

1. 将 `Summary!B2` 条件格式加入 `between 1000/2000`、绿色通过草稿；源 SHA-256 不变，界面显示 1 个对象更改。
2. 选择 `Inventory!A1:C3`，将 `InventoryTable` 样式加入 `TableStyleMedium4` 草稿；源 SHA-256 仍不变，界面显示 `保存 (2)`。
3. 撤销后对象数为 1，重做后恢复为 2；点击一次顶部保存后文件摘要变化。
4. 重开真实文件，条件格式与 Table 样式全部复读一致；仓库 fixture 摘要不变，临时目标发生变化，运行时错误 0，阻断错误界面 0。

Rust 定向测试还验证纯 Table 对象草稿在零单元格变更时可保存并复读。M1A4B1 的混合事务测试继续覆盖单元格、条件格式与 Table 同时提交，以及旧签名拒绝且失败不改文件。

验证命令：

- `npm run build`
- `npm run check:post-v115-m1a4b2-xlsx-object-drafts`
- `npm run audit:post-v115-m1a4b2-xlsx-object-drafts`
- `cargo test --locked --manifest-path src-tauri/Cargo.toml writes_object_only_draft_without_cell_changes -- --nocapture`
- `cargo test --locked --manifest-path src-tauri/Cargo.toml writes_cell_conditional_format_and_table_drafts_in_one_transaction -- --nocapture`

证据：`docs/evidence/post-v115-m1a4b2-xlsx-object-drafts/`。

## 结论与下一步

M1A4 的条件格式可视编辑、后端原子事务、前端对象草稿、撤销/重做和显式保存边界均已关闭；连同 M1A1 至 M1A3，M1A XLSX 日常编辑增强阶段收口。当前不提升版本。

下一步进入 M1B0，只审计 DOCX/PPTX 常用对象的真实现状、可保持包结构、编辑与可靠副本边界、现有 fixture 和生产者证据缺口，再选择 M1B1 的最小完整对象能力。不得直接把预览能力写成完整编辑，也不得在没有 Excel/WPS/LibreOffice 证据时扩大高级对象声明。
