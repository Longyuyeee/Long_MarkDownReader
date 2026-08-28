# Post-v1.0.15 M4A-5 DOCX 标题/ODS 工作表图谱定位覆盖审计

日期：2026-08-28

分支：`main`

开发目标：`1.0.16`

运行时与公开版本：`1.0.15`

发布状态：`releaseCandidate=false`

## 1. 结论

M4A-5 已按 M4A-4 冻结合同完成。DOCX 现在具有 `docx` 文档节点和最多 512 个非空 `docx_heading`；标题按文档顺序归属最近的、level 数值更小的前置标题，否则归属文档，形成真实有界大纲。ODS 现在具有 `ods` 文档节点和全部已解析 `ods_sheet`，继续沿用解析器 128 sheet 上限。四类对象均已进入统一图谱语义事实源。

真实 Tauri/WebView2 固定夹具得到 5 个节点（2 父、3 子）和 3 条 `contains`，结构 mention 为 0，DOCX 普通 block 与 ODS cell 节点为 0。同一源重复构建的子节点 ID/父 ID 完全一致。从 Graph 精确打开 DOCX H1 与 ODS `Overview`，从父对象关系上下文精确打开同一 H1 与 ODS `Notes`；4 次均保留“内部对象上下文”并 4/4 返回 Graph。运行时错误为 0，两个源文件摘要不变。

下一接续点冻结为 **M4A-6 M1 对象定位覆盖退出审计**：独立复核统一搜索、Graph、关系上下文及返回能力后，再决定是否结束 M4A 并进入工作台对象行动。当前不进入转换或版本冻结。

## 2. 实现与冻结要求对齐

| 冻结要求 | 实际实现 | 结果 |
| --- | --- | --- |
| DOCX 最多 512 个非空 heading | `MAX_DOCX_GRAPH_HEADINGS=512`，只遍历解析器 `headings` | 通过 |
| 标题大纲父级正确 | 弹出所有 level 大于等于当前值的栈元素，取最近剩余标题，否则文档 | 通过 |
| 复用 DOCX 内部定位 | `docx-block` + 解析器 `block_id` | 通过 |
| ODS 最多 128 个 sheet | `MAX_ODS_GRAPH_SHEETS=128`，不遍历 cell 创建节点 | 通过 |
| 复用 ODS sheet 定位 | `ods-sheet` + `ods-sheet-{n}` | 通过 |
| 结构边不伪造 mention | 每个子节点恰有一条 `contains`，mention 为空 | 通过 |
| 显式语义和通用上下文 | 四类语义已登记，复用 locator 通用焦点合同 | 通过 |

DOCX 文档节点继续使用完整解析文本的有界前缀进行图谱搜索；标题节点使用对应标题文本。ODS 文档节点使用有界全文，sheet 节点只聚合本 sheet 的非空 cell 文本。搜索仍保留普通 DOCX block 和 ODS cell 的原有细粒度结果，因此没有用图谱粒度削弱搜索定位。

## 3. 回归与真实证据

- Rust 图谱测试 32/32 通过，其中新增：
  - 多级序列 `H1 → H2 → H3 → H2 → H4 → H1 → H3` 的父级 oracle；
  - 真实 DOCX/ODS 的 2 父、3 子、3 边、定位、同源身份、知识快照和源安全测试。
- 真实图谱：`docx` 1、`docx_heading` 1、`ods` 1、`ods_sheet` 2。
- 真实关系：3 条 `contains`，mention 0；`docx_block` / `ods_cell` 节点 0。
- Graph 打开：H1、`Overview`；关系上下文打开：H1、`Notes`。
- 返回 Graph：4/4；运行时错误：0；阻断错误界面：未出现。
- 同一源重复构建：子节点 ID 与 parent ID 一致。
- 源文件：DOCX/ODS SHA-256 前后一致。
- 三张 1280×820 截图已人工复核，图谱图例、节点、关系和内部上下文均正确，未包含完整本机路径。

## 4. 审计与纠偏

实现前再次核对了“最近前置上级标题”的数值语义：父标题必须是 level 数值更小的最近前置标题，例如 H3 归属最近 H2；不能把“低级别”措辞误实现成数值更大。该规则已抽为生产函数并用独立序列测试，不依赖只有一个 heading 的真实夹具。

M4A-4 历史门禁原本要求 DOCX/ODS 图谱分支和语义仍不存在，这是选择审计当时的正确前置状态，但会在已授权的 M4A-5 实现后形成假失败。门禁已纠正为验证 M4A-4 → M4A-5 政策链、实际 dispatch 和四类语义均与选择一致；M4A-4 的原始桌面证据仍保持“实现前候选节点 0”，没有重写历史结果。

真实审计没有暴露新的产品偏移。DOCX 标题在画布上因长名称按现有视觉规则截断，但详情、关系上下文和实际阅读器均显示完整标题，不影响定位或语义；本阶段未借机修改通用视觉系统。

## 5. 验证命令

- `cargo test --locked --manifest-path src-tauri/Cargo.toml commands::graph::tests`
- `rustfmt --check --edition 2021 src-tauri/src/commands/graph.rs`
- `npm run build`
- `npm run check:post-v115-m4a4-docx-ods-graph-granularity-selection`
- `npm run audit:post-v115-m4a5-docx-heading-ods-sheet-graph-location`
- `npm run check:post-v115-m4a5-docx-heading-ods-sheet-graph-location`
- `npm run check:post-v115-m3a1-semantics`
- `npm run check:graph-product-contract`
- `npm run check:development-version-identity`

结构化证据位于 `docs/evidence/post-v115-m4a5-docx-heading-ods-sheet-graph-location-coverage/interaction-evidence.json`，三张截图及 SHA-256 清单位于同目录。

M4A-5 至此收口。普通 DOCX block 与 ODS cell 仍是搜索/阅读对象，不宣称已成为图谱对象；工作台行动、转换统一和发布冻结仍按路线后置。
