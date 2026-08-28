# Post-v1.0.15 M4A-2 M1 对象图谱定位扩面选择审计

日期：2026-08-28

分支：`main`

开发目标：`1.0.16`

运行时与公开版本：`1.0.15`

发布状态：`releaseCandidate=false`

## 1. 结论

M4A-2 已完成，下一最小实现批次冻结为 **M4A-3 Workbook 工作表与 ODP 幻灯片图谱定位覆盖**。本阶段按原始路线要求停在选择审计，没有在结论形成前直接修改图谱产品代码。

真实 Tauri/WebView2 会话确认：DOCX、ODS、ODP、Workbook 均能解析并通过知识搜索产生稳定内部定位器，但当前 `build_link_graph` 对四种扩展名均无分支，真实图谱中的候选父/子节点总数为 0。两张截图经人工复核，Workbook 搜索明确显示 `工作表：Inventory`，同一资料库图谱只显示 Markdown 控制节点。

## 2. 真实对象与缺口

| 候选 | 真实夹具对象 | 已有定位 | 当前图谱 | 解析/索引上限 | 选择 |
| --- | ---: | --- | --- | ---: | --- |
| DOCX | 13 block、5 related item | `docx-block/docx-block-6` | 0 | 50,000 block | 延期 |
| ODS | 2 sheet、5 cell | `ods-cell/ods-sheet-2:A1` | 0 | 200,000 cell | 延期 |
| ODP | 2 slide | `odp-slide/odp-slide-1` | 0 | 2,000 slide | M4A-3 |
| Workbook | 4 sheet | `workbook-sheet/Inventory` | 0 | 64 sheet（索引范围） | M4A-3 |

DOCX block 混合段落、标题、表格等语义，直接全部入图既扩大规模也没有先定义专业粒度。ODS cell 上限更高，逐单元格入图会突破既有大图的可控范围；应在后续单独决定 sheet 级还是有界 cell 级策略。ODP slide 与现有 PPTX slide、Workbook sheet 与现有 Table view 都是稳定且有界的容器对象，能复用已验证的父节点、子节点、`contains` 结构边和统一打开合同，因此组成一个同构的最小批次。

## 3. M4A-3 冻结合同

- 新增父对象 `workbook`、`odp`，子对象 `workbook_sheet`、`odp_slide`。
- Workbook 真实夹具必须产生 1 个父节点、4 个 sheet 子节点和 4 条 `contains`；ODP 必须产生 1 个父节点、2 个 slide 子节点和 2 条 `contains`。
- 结构关系来自包内层级，不伪造 Markdown mention，因此 6 条结构边的 mention 总数必须为 0。
- 子节点必须携带既有 `workbook-sheet` / `odp-slide` 定位器，通过 `openManagedObject` 从 Graph 和关系上下文打开正确内部位置。
- 图谱语义注册表必须显式登记四种对象类型，不使用“其他对象”回退冒充完成。
- 真实桌面验收必须覆盖 6 个子节点、6 条结构边、内部位置、返回图谱、0 运行时错误和四个源文件摘要不变。

## 4. 审计与纠偏

选择前的直觉范围是 DOCX、ODS、ODP、Workbook 全部内部对象；实际代码上限显示这会把 5 万 block 和 20 万 cell 同时引入图谱，偏离“最小扩面批次”和既有专业大图预算。范围现纠正为两个同构、容器级对象，DOCX/ODS 明确延期而非遗漏。

真实夹具虽很小（DOCX 13 block、ODS 5 cell），也不能据此忽略生产上限。选择依据同时包含真实可定位性、稳定 ID、结构关系来源和最坏规模，而不是用小夹具表现代替产品边界。

全量图谱合同首次复跑暴露两条历史检查漂移：连线距离实现已在 M3C Worker 化时移至 `graphForceLayoutKernel`，PPTX 图谱打开也已在 M4A-1 改为共享 `openManagedObject`，旧检查却仍只扫描 `GraphView.vue` 内的旧局部符号。门禁已改为分别核对布局内核和共享导航合同，没有为了通过检查恢复重复的组件分派。

开发版本身份门禁首次复跑仍把当前阶段直接绑定到 M4A-1 的下一步。阶段已依事实前移到 M4A-3，因此门禁补入 M4A-1 → M4A-2 → M4A-3 的政策链校验；公开/运行时版本、发布标签和 `releaseCandidate=false` 均未改变。

首次视觉复核还发现关闭节点详情后的过渡帧会残留临时审计路径。捕获脚本现等待详情 DOM 消失并完成过渡后截图；修订后的第一次隔离重跑在 `rebuild_knowledge_index` 处出现一次瞬时未捕获错误，清理隔离会话后原样重跑通过。最终提交证据来自完整通过会话，不保留含临时路径的旧截图。

## 5. 验证证据

- 真实桌面：`npm run audit:post-v115-m4a2-object-graph-selection`
- 选择合同：`npm run check:post-v115-m4a2-object-graph-selection`
- 图谱回归：`npm run check:graph-product-contract`
- 前端构建：`npm run build`
- Rust 图谱测试：`cargo test --locked --manifest-path src-tauri/Cargo.toml commands::graph::tests`
- 结构化证据：`docs/evidence/post-v115-m4a2-m1-object-graph-coverage-selection/selection-evidence.json`
- 视觉证据：`workbook-search-locator-1280.jpg`、`m1-object-graph-gap-1280.jpg`，均已人工复核。

下一接续点唯一为 **M4A-3 Workbook 工作表与 ODP 幻灯片图谱定位覆盖**。工作台全对象行动、转换统一、新转换类型、DOCX/ODS 粒度决策和版本冻结均不并入。
