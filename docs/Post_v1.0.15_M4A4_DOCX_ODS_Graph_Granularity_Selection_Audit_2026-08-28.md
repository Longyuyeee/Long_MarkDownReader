# Post-v1.0.15 M4A-4 DOCX/ODS 图谱粒度选择审计

日期：2026-08-28

分支：`main`

开发目标：`1.0.16`

运行时与公开版本：`1.0.15`

发布状态：`releaseCandidate=false`

## 1. 结论

M4A-4 已完成，下一最小实现批次冻结为 **M4A-5 DOCX 标题与 ODS 工作表图谱定位覆盖**。本阶段按路线要求停在粒度选择，没有提前修改 DOCX/ODS 图谱产品分支或语义注册表。

DOCX 选择文档父节点与最多 512 个非空 `docx_heading`：沿用解析器已有 heading/level 语义和 `docx-block` 定位器，按文档顺序建立大纲，标题归属最近的、level 数值更小的前置上级标题，否则归属文档。普通段落、列表、表格、图片、分页和关联内容不入图。ODS 选择文档父节点与全部 `ods_sheet`，沿用解析器最多 128 个工作表的边界及阅读器已支持的 `ods-sheet` 定位；20 万个 cell 继续只用于搜索和精确定位，不入图。

该方案对一对达到上限的 DOCX/ODS 最多产生 642 个节点和 640 条 `contains`，是已验收 5,000 节点档的 12.84%；全量 block/cell 方案会产生 250,002 个节点和 250,000 条结构边，约为有界方案的 389 倍，明显偏离专业大图的已验证范围。

## 2. 实际代码与语义依据

| 候选粒度 | 实际代码事实 | 最大规模 | 决策 |
| --- | --- | ---: | --- |
| DOCX block | 混合 heading、paragraph、list-item、table、image、page-break 等；ID 为可见块顺序号 | 50,000 | 延期 |
| DOCX heading | 解析器已单独保留 `block_id`、文本和 1～9 级 level；阅读器能消费 `docx-block` | 选定上限 512 | M4A-5 |
| ODS cell | 搜索已产生 `ods-cell` 精确定位；单元格语义过细 | 200,000 | 延期 |
| ODS sheet | 解析器已有顺序 ID、名称和内容；阅读器可直接消费 `ods-sheet-{n}` | 128 | M4A-5 |

DOCX 标题身份和 ODS sheet 身份均定义为“同一源字节重复解析时确定”，不宣称在用户插入、删除或重排内容后保持不可变。图谱每次由当前文件重建，因此该边界与现有对象定位合同一致；后续实现必须用同一源重复构建测试验证确定性。

标题层级没有被简化为全部直连文档。使用最近的、level 数值更小的前置标题作为父对象，既保留真实大纲，又保证每个 heading 只有一条结构父边；缺级标题安全回落到最近可用上级或文档，不制造正文 mention。

## 3. 真实桌面与规模证据

- Microsoft Word 夹具：13 个 block，其中 heading 1、paragraph 6、list-item 2、table 1、page-break 1、rendered-page-break 1、image 1。
- ODS 夹具：2 个 sheet、5 个非空 cell，工作表为 `Overview`、`Notes`。
- 既有搜索：`docx-block/docx-block-6` 与 `ods-cell/ods-sheet-2:A1` 仍精确有效。
- 拟选定位：`docx-block/docx-block-1` 精确打开 H1；`ods-sheet/ods-sheet-2` 精确切换到 `Notes`。
- 当前图谱：`docx`、`docx_heading`、`ods`、`ods_sheet` 候选节点仍为 0，证明本阶段没有提前实现。
- 运行时错误 0；阻断错误界面未出现；DOCX/ODS 源 SHA-256 前后一致。
- 两张 1280×820 截图已人工复核，均无用户资料或完整本机路径。

## 4. 需求对齐与纠偏

原始 M4 要求 M1 新对象能被搜索和图谱定位，但同时要求真实测试和大图性能保障。若机械地把已有搜索段等同于图谱节点，DOCX 5 万 block 与 ODS 20 万 cell 会让单对文档直接达到 25 万子节点；这不是“覆盖更完整”，而是把搜索粒度误当成知识组织粒度。选择现纠正为“搜索保持细粒度，图谱采用大纲/容器粒度”。

ODS sheet 定位器此前没有作为搜索结果输出，但实际阅读器已能将 `ods-sheet-{n}` 解析为活动工作表。真实桌面验证 `Notes` 精确打开后，M4A-5 可以安全复用共享导航合同，不需要先制造一套新路由。

DOCX 只有 heading 子集进入图谱，意味着无标题文档在 M4A-5 仍只有文档父节点；不得用普通段落回填伪标题。512 是明确的图谱上限，不改变解析器的 50,000 block 读取边界，也不减少搜索对普通 block 的覆盖。

## 5. M4A-5 冻结合同

- 新增 `docx`、`docx_heading`、`ods`、`ods_sheet` 四类显式语义。
- DOCX 只取文档顺序中的前 512 个非空 heading，沿用 `docx-block` locator，并按 level 建立有界大纲 `contains`。
- ODS 为全部已解析 sheet 建立节点，上限沿用 128，使用 `ods-sheet` locator；不建立 cell 节点。
- 每个选中子节点恰有一条结构父边，全部结构 mention 为 0。
- 固定真实夹具预期：2 个父节点、1 个 DOCX heading、2 个 ODS sheet、3 条结构边。
- 从 Graph 和关系上下文精确打开 heading 与 sheet，验证返回 Graph、运行时错误 0、源摘要不变。
- 工作台全对象行动、转换统一、新转换类型和版本冻结继续后置。

## 6. 验证与证据

- 真实桌面：`npm run audit:post-v115-m4a4-docx-ods-graph-granularity-selection`
- 选择合同：`npm run check:post-v115-m4a4-docx-ods-graph-granularity-selection`
- 开发版本身份：`npm run check:development-version-identity`
- 图谱产品回归：`npm run check:graph-product-contract`
- 前端构建：`npm run build`
- 结构化证据：`docs/evidence/post-v115-m4a4-docx-ods-graph-granularity-selection/selection-evidence.json`
- 视觉证据：`docx-heading-location-1280.jpg`、`ods-sheet-location-1280.jpg`，均已人工复核。

M4A-4 至此收口。下一接续点唯一为 **M4A-5 DOCX 标题与 ODS 工作表图谱定位覆盖**；未经该实现与真实桌面验收，不宣称 DOCX/ODS 已完成图谱覆盖。
