# v1.0.15 后续 M3A-4 关系证据与来源回跳审计（2026-08-27）

## 结论

M3A-4 已完成最短路径关系证据闭环。路径中的每条边都展示关系类型、事实方向和路径是否沿反向发现；带 `mentions[]` 的关系逐条展示全部来源语法、上下文、行号和 mention 自身类型，并可回到来源 Markdown 的准确证据行。没有 mention 的跨格式结构关系明确标为“结构关系”，复用来源对象的页码、批注、视图、节点或幻灯片定位，不伪造 Markdown 文本证据。

生产代码使用独立的路径证据投影函数，保持 `GraphEdge`、原始源/目标和 mention 顺序不变。固定图谱合同验证同一边的两条 mention 均保留、结构边保持空证据边界，以及反向遍历不会改写事实方向。

## 真实桌面结果

真实 Tauri 跨格式路径 `NorthStar → Brief → PDF 批注 → Evidence` 包含 3 条边：

- `Brief → NorthStar` 的 `depends-on` 有向关系被路径反向经过，同一边的两条 mention 全部显示；
- `Brief → PDF 批注` 的 `annotates` 有向关系显示 URI、原始上下文和第 6 行；
- `Evidence → PDF 批注` 的 `contains` 有向结构关系被路径反向经过，明确显示无 Markdown mention 并提供来源对象入口。

点击第一条 mention 后实际打开 `Brief.md`，定位并高亮第 3 行 `depends-on` 来源块。1280×800 与 720×800 证据面板均无页面横向溢出，源文件 SHA-256 前后相同、运行时错误为 0，并可重新进入图谱和返回资料库。

人工复核发现初版窄屏仍让节点详情与证据层竞争，关闭按钮也随滚动落到底部；已在最终证据前纠正为打开路径时收起详情、关闭按钮固定在面板顶部，并重新执行生产构建和真实桌面审计。

## 需求对齐与边界

- 本阶段直接对齐 `FR-GRAPH-004` 的来源语法、方向、上下文和关系类型，以及 S1-1 留下的“全部证据展开定位”。
- M3A 的最短路径工作流已完成全部证据回跳；`FR-GRAPH-004` 整体仍保持“部分完成”，因为普通节点详情和编辑器内局部图谱仍以首条 mention 摘要为主，不能用本阶段结果冒充所有图谱入口均已完成全部展开。
- 回跳只读取并定位事实源，不修改关系、文件、筛选或布局；结构关系不把对象定位描述成原文 mention。
- 公开/运行时仍为 `1.0.15`，开发目标仍为 `1.0.16`，`releaseCandidate=false`。

## 验证与接续

- `npm run build`
- `npm run check:post-v115-m3a4-relation-evidence`
- `npm run audit:post-v115-m3a4-relation-evidence`
- `npm run check:graph-product-contract`
- 证据：`docs/evidence/post-v115-m3a4-relation-evidence/desktop.json`、`relation-evidence-wide.jpg`、`relation-evidence-narrow.jpg`、`relation-source-return.jpg`

下一阶段固定为 **M3A-5 社区发现与稳定性**：先冻结确定性社区输入、稳定社区 ID、摘要和筛选合同，再接真实桌面工作流；不得提前进入 M3B 视觉镜头或 M3C 大图优化。
