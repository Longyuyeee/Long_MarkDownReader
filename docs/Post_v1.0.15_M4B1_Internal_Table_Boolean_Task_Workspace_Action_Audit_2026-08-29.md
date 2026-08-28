# M4B-1 内部 Table 布尔任务行工作台行动审计

日期：2026-08-29

阶段：M4B-1

状态：通过；下一接续点为 M4B-2 工作台对象行动退出审计

版本边界：运行时/公开 `1.0.15`，开发目标 `1.0.16`，`releaseCandidate=false`

## 1. 原始需求对齐

原始 M2 工作台要求围绕“继续工作、今天要做、需要处理”提供可执行行动，而不是新增格式统计页；M4 要求跨格式对象能够从入口打开到稳定内部位置。M4B-0 在七类候选中只批准内部 `.table.json` 的显式布尔任务行进入本批次，因为它具备明确任务语义、稳定 row/column ID、内容签名与可靠写入基础。

本阶段严格保持该选择：Table 任务进入现有“今天要做”和现有筛选，不新增卡片；CSV/TSV 不推断任务，OPML、DOCX、ODS、ODP、PPTX 与 Workbook 不增加工作台写回；转换、版本提升和发布候选继续后置。

## 2. 实际代码复核与纠偏

开发前复核了 `workspace.rs`、Table 解析/可靠写入、`WorkspaceHome.vue`、共享 `fileNavigation` 以及 Tauri 命令注册。已有事实是：Markdown 待办具备窄写回与撤销，PDF 批注只提供查看，Table 已有稳定 row/column ID、签名、解析和可靠写入，但工作台尚未发现 Table 任务。

最重要的实现纠偏是撤销语义。现有 Table 编辑器保存会重序列化整份 JSON，即使语义相同，也不能保证撤销后与原文件逐字节一致。M4B-1 因此没有复用整表序列化写入，而是启用 `serde_json` 的 `raw_value`，从借用的原始 JSON 中取得目标单元格字符串的精确字节区间，仅将 `"false"` 与 `"true"` 互换。这样可保留 UTF-8 BOM、缩进、换行、未知字段、字段顺序和全部非目标字节。

另一次过程纠偏来自误用 `cargo fmt` 的文件参数：命令实际格式化了整个 crate，产生了无关格式/行尾噪声。所有非本阶段内容差异已清除，最终业务 diff 只保留 Table 任务所需文件；后续没有再次运行全 crate 格式化。

## 3. 完成范围

- 只扫描资料库内文件名以 `.table.json` 结尾且不超过 8 MiB 的内部 Table。
- 必须恰好有一个 boolean 列，其去空格、忽略大小写名称为“完成 / 已完成 / done / completed”。
- 单元格值必须是严格 JSON 字符串 `"true"` 或 `"false"`；不接受宽松真值。
- 标题优先使用活动视图中类型为 text 的 `titleColumn`，否则使用首个 text 列；空标题不进入任务列表。
- Table 与 Markdown 任务共用现有未完成/已完成/全部及文件、优先级、日期筛选。
- Table 打开通过共享 `table-row` 定位器，使用稳定 row ID 精确选中目标行。
- 完成和恢复前显示确认；成功后使用新签名单步撤销。
- 写入重新校验资料库边界、扩展名、初始和写前签名、row/column ID、完成列语义、标题、类型和旧值；可靠写入后逐字节读回。

## 4. 安全与失败边界

| 场景 | 结果 |
| --- | --- |
| 取消确认 | 文件摘要不变 |
| 完成未完成行 | 只改变目标 `"false"` 为 `"true"` |
| 撤销 | 完整原始字节恢复 |
| 恢复已完成行后再次完成 | 文件再次回到初始完整字节 |
| 外部程序先修改文件 | 陈旧签名被拒绝，冲突后的文件不再写入 |
| 行、列、类型、标题或旧值变化 | 命令拒绝，要求刷新工作台 |
| CSV/TSV、歧义完成列、超 8 MiB Table | 不发现、不写入 |

## 5. 自动化与真实桌面结果

Rust Workspace 测试新增并通过三类真实文件合同：带 BOM 的内部 Table 完成/撤销逐字节往返、外部修改后的旧签名拒绝，以及超过 8 MiB 的命令级拒绝；Workspace 测试合计 `8/8`。前端 TypeScript/Vite 构建通过。

真实 Tauri 临时资料库使用固定 M4B-0 Table 与 Markdown 夹具，最终结果：

| 指标 | 实际结果 |
| --- | --- |
| 初始未完成任务 | 2（Table 1 + Markdown 1） |
| 初始已完成任务 | 1（Table 1） |
| Table 任务总数 | 2 |
| 首个行动入口 | 744 ms，预算 5,000 ms |
| 取消/完成/撤销 | 通过；撤销逐字节恢复 |
| 恢复后重做 | 通过；回到初始完整字节 |
| 陈旧签名冲突 | 拒绝且不写入 |
| Table 精确定位 | 唯一选中第 1 行 |
| 视口 | 1280×820、480×700 均无横向溢出 |
| 运行时错误/阻断错误面 | 0 / 无 |
| 审计结束源文件 | Table 与 Markdown SHA-256 均等于初始值 |

真实审计自动化曾发现两处测试编排偏差：取消弹窗退场动画尚未结束时开始第二次确认，导致脚本误点旧节点；Table 同一选择同时标记数据行和行号，联合选择器把一行计为两个元素。两项均按真实 DOM 生命周期和唯一数据行语义修正，产品验收目标和预算没有放宽，完整流程重新运行通过。

## 6. 视觉证据

证据目录：[`evidence/post-v115-m4b1-internal-table-boolean-task-workspace-action`](./evidence/post-v115-m4b1-internal-table-boolean-task-workspace-action/)

- `table-tasks-workspace-1280.jpg`：Table 与 Markdown 待办共享工作台列表。
- `table-task-completed-1280.jpg`：完成后的撤销入口与未完成计数。
- `table-task-locator-1280.jpg`：共享定位器精确打开 Table 第 1 行。
- `table-task-conflict-1280.jpg`：外部修改冲突的用户可见拒绝提示。
- `table-tasks-restored-480.jpg`：480px 恢复态，操作入口完整可达。

五张截图已逐张人工复核：无本机完整路径、无用户内容、宽窄屏布局可读；manifest 状态为 `accepted-after-visual-review`。

## 7. 审计命令

```text
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::workspace::tests
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::table::tests
npm run build
npm run audit:post-v115-m4b1-internal-table-task
npm run check:post-v115-m4b1-internal-table-task
npm run check:post-v115-m4b0-workspace-object-action-selection
npm run check:development-version-identity
git diff --check
```

## 8. 下一接续点

下一阶段固定为 **M4B-2 工作台对象行动退出审计**。该阶段只组合复验现有 Markdown 待办、PDF 批注查看与新增 Table 布尔任务，重新核对其他 M1 格式延期边界并决定 M4B 是否收口；不得新增对象行动，不得提前混入转换统一、二进制版本提升或 release candidate。
