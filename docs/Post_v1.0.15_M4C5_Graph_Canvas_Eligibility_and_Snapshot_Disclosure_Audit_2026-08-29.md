# M4C-5 图谱→Canvas 资格纠偏与快照披露审计

日期：2026-08-29

阶段：M4C-5

状态：通过；下一接续点为 M4C-6 受控转换退出审计

版本边界：运行时/公开 `1.0.15`，开发目标 `1.0.16`，`releaseCandidate=false`

## 1. 结论

M4C-5 已关闭图谱→Canvas 的中心资格漂移和写盘前披露缺口。原始路线明确要求 PDF 与数据表节点可以作为局部思维导图中心并连同邻居发送到 JSON Canvas，因此没有把入口错误收窄为 Markdown/PDF；实际纠偏是让 `build_local_graph` 与既有 Canvas 命令共同使用 Markdown、PDF、CSV、TSV、开放 `.table.json` 的统一解析器，并让前端只对顶层 Markdown、PDF、Table 对象开放。普通 JSON、OPML、Canvas/Office 父对象及所有内部子对象不具备该行动资格。

创建前现在披露相对中心、当前 1～4 层范围、资料库根目录候选目标、不覆盖/编号/自动打开，以及文件节点、关系方向/类型、字段损失、广度优先重新布局和独立时间点快照语义。创建后通知资料库刷新并打开后端返回的实际文件。

## 2. 需求对齐与代码纠偏

原始需求中的 PDF 和表格图谱能力决定了正确方向是扩展局部图谱中心解析，而不是删除 CSV/TSV/Table 能力。实现新增单一 `resolve_local_graph_center`，同时供 `build_local_graph` 与 `create_canvas_from_graph` 使用：

- 允许 `.md`、`.pdf`、`.csv`、`.tsv` 和后缀严格为 `.table.json` 的开放 Table；
- 普通 `.json` 返回明确错误，其他扩展由资料库边界拒绝；
- 前端资格收敛为无 `parentId` 的 `markdown`、`pdf`、`table`；
- 内部 Table view 等子对象保持禁用，因为它们没有独立源文件身份。

审计进一步固化了一个此前文档未充分说明的真实损失：Canvas 文件节点只保存资料库相对 `file`，不保存图谱对象标题、标签、搜索文本、修改时间或内部 locator。因此同一 Table 的父对象与内部视图会成为两个指向相同 `.table.json` 的文件节点，不能把该输出描述为无损对象投影。

## 3. 真实桌面与文件结果

隔离资料库覆盖 Markdown、PDF、CSV、TSV、Table、普通 JSON、OPML 和 Canvas。真实 Tauri/WebView2 结果如下：

| 项目 | 实际结果 |
| --- | --- |
| 合法中心 | Markdown、PDF、CSV、TSV、`.table.json` 共 5/5 成功建立局部图谱 |
| 非法中心 | 普通 JSON、OPML、Canvas 后端均拒绝 |
| 前端资格 | Markdown/Table 顶层入口启用；OPML、Canvas、Table 内部 view 禁用 |
| 1280 流程 | 完整披露；取消后目标不存在；创建并自动打开 `Graph Center 思维导图.canvas` |
| 480 碰撞流程 | 完整可滚动披露；既有目标不变；创建并打开 `Data Board 思维导图 1.canvas` |
| 首个目标复读 | 2 个相对文件节点、1 条关系；中心/邻居颜色与 0/360 深度坐标正确 |
| Table 目标复读 | 2 个节点、1 条 `contains` 关系；两个节点均指向 `Data Board.table.json`，locator 损失被真实观察 |
| 关系投影 | 两份目标的关系类型和有向/无向箭头均与各自局部图谱一致 |
| 来源安全 | 10 个预置文件最终 SHA-256 全部等于初始值 |
| 运行时/阻断错误面 | 0 / 无 |

四张最终截图已逐张人工复核并接受：宽窄披露均完整可读，首个与编号 Canvas 均在确认框完全关闭后显示真实目标；成功提示保留实际文件名和自动打开反馈。

## 4. 审计过程纠偏

1. 首轮脚本仅修改同一 Graph 组件的查询参数，组件没有重新挂载，导致后续对象仍保留上一个选择。审计改为每次从资料库重新进入图谱，以真实路由生命周期选择对象。
2. PowerShell 5.1 对无 BOM 脚本中的中文碰撞文件名产生错误解码，后端因此正确创建未编号目标。碰撞文件改由 Node 以 Unicode 路径创建后从全新资料库重跑。
3. 首次全数据通过后的人工复核发现宽屏目标截图仍处于异步对话框退场过程。增加确认框完全关闭门禁并完整重跑；产品门禁未放宽。

## 5. 证据与验证

证据目录：[`evidence/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure`](./evidence/post-v115-m4c5-graph-canvas-eligibility-and-snapshot-disclosure/)

Manifest 状态为 `accepted-after-visual-review`，交互证据状态为 `passed`。

```text
npm run audit:post-v115-m4c5-graph-canvas
npm run check:post-v115-m4c5-graph-canvas
cargo test --locked --manifest-path src-tauri/Cargo.toml local_graph_center_supports_graph_canvas_file_types_only
npm run build
npm run check:post-v115-m4c4-graph-project-note
npm run check:post-v115-m4c3-graph-output-selection
npm run check:post-v115-m4c2-opml-canvas-projection
npm run check:post-v115-m4c1-csv-tsv-table-conversion
npm run check:post-v115-m4c0-controlled-conversion-selection
npm run check:post-v115-m4b2-workspace-object-action-exit
npm run check:development-version-identity
git diff --check
```

## 6. 下一接续点

下一阶段固定为 **M4C-6 受控转换退出审计**：组合复验 CSV/TSV→Table、OPML→Canvas、图谱→项目笔记和图谱→Canvas 四条已选择工作流的来源、目标、覆盖/编号、损失披露、取消、自动打开、目标复读与源安全，并判断 M4C 是否可以退出。

在 M4C-6 通过前不得进入 `M4-release-freeze`，也不得把全局转换框架、临时产物清理或新转换类型混入本阶段。
