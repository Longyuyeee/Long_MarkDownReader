# C1-2B2 DOCX 表格、分页与版式桌面收口审计

> 审计日期：2026-07-27
> 阶段范围：C1-2B 第二切片与只读工作面收口
> 结论：C1-2B2 已完成；C1-2B 的代码、索引和真实 Tauri 工作面范围已收口，C0-2 真实生产者矩阵仍是进入可靠 DOCX 写回前的独立门禁

## 1. 本批完成内容

- 表格单元格模型保留 `gridSpan` 与 `vMerge`，前端以真实 `colspan`、`rowspan` 呈现横向和纵向合并。
- 显式分页符、段前分页与 `lastRenderedPageBreak` 进入结构块和兼容画像，可在工作面中识别、定位并区分。
- `sectPr` 的分节类型、纸张尺寸、方向、页边距、页眉页脚距离和分栏数进入结构化摘要。
- DOCX 兼容画像新增合并单元格、显式分页、渲染分页和节数量。
- C1-2B1 的页眉、页脚、脚注、尾注、批注正文、引用锚点和全局索引在升级后的桌面夹具中完成真实 Tauri 搜索验证。

## 2. 实现与契约

核心实现位于：

- `src-tauri/src/formats/docx.rs`
- `src/views/DocxReaderView.vue`
- `scripts/check-format-contract.mjs`

新增 Rust 回归 `parses_merged_cells_page_breaks_and_section_layout`，覆盖：

- 横向两列合并；
- 纵向两行合并与续接单元格隐藏；
- 段前分页、显式分页和渲染分页；
- 横向纸张、连续分节、双栏和页边距。

格式契约要求解析器和工作面同时保留这些语义，避免后端只计数、前端静默展开或丢失。

## 3. 真实桌面证据

完整 A5/G8/B/C 桌面自动化最终通过 **34 项检查、26 张真实 Tauri Debug/WebView2 截图**。

本批直接证据：

- `docs/evidence/a5-stage-a/c1-docx-structured-reading.jpg`
- `docs/evidence/a5-stage-a/c1-docx-layout-and-related-content.jpg`
- `docs/evidence/a5-stage-a/audit-manifest.json`

新检查 `c1-docx-layout-and-related-content` 在真实 WebView2 中验证：

- `td[colspan="2"]` 与 `td[rowspan="2"]`；
- 显式分页和渲染分页标记；
- 横向、双栏节摘要；
- 批注正文搜索命中与附属内容呈现。

自动化夹具由项目脚本合成，用于稳定回归和桌面交互证明；它不能替代 Word、WPS、LibreOffice 真实生产者文件。

## 4. 边界判定

C1-2B 现在可以判定为只读阶段收口：

- 正文、标题、列表、表格、图片、附属内容和基础版式均有结构模型；
- 文内搜索、全局索引、对象定位和真实桌面呈现已贯通；
- 原 DOCX 始终只读，没有新增写回命令。

以下仍未完成：

- Microsoft Word、WPS、LibreOffice 三类真实生产者 C0-2 fixture、哈希、许可和重开矩阵；
- 修订接受/拒绝、域计算、复杂绘图、嵌入对象和未知扩展的编辑；
- 任何用户 DOCX 原件覆盖。

## 5. 下一阶段

1. **C0-2**：获取三类真实生产者 DOCX，记录版本、生成步骤、许可、哈希、预期结构和应用内读取证据。
2. **C2A**：可并行建设仅作用于内存/临时副本的 OOXML 补丁、包差异审计和写后复读原型；不得替换用户原件。
3. **C2B～C2E**：只有 C0-2 与隔离保真门禁通过后，才依次开放普通段落/标题、简单列表/表格、基础样式/图片以及可靠另存。

下一开发入口优先为 **C0-2 真实生产者矩阵准备**；若当前机器仍没有三类办公软件，只能把它登记为外部证据依赖，并在严格隔离边界内推进 C2A。
