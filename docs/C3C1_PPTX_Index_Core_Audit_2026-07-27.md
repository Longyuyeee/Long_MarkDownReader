# LongEdit C3C1 PPTX 索引内核审计

> 审计日期：2026-07-27
> 开发分支：`codex/c3c1-pptx-index`
> 阶段目标：共享 PPTX 搜索段、持久化索引与实时扫描一致性

> 后续更新：C3C2 精确定位已经完成，最新交付证据与下一入口见 [`C3C2_PPTX_Precise_Locator_Audit_2026-07-27.md`](./C3C2_PPTX_Precise_Locator_Audit_2026-07-27.md)。

## 1. 阶段结论

C3C1 已完成。PPTX 已从“工作面内搜索”提升为可进入统一、可删除和可重建的全局知识索引。

本阶段只建立只读索引基础，没有提前实现 C3C2 路由消费、高亮导航、C3C3 KnowledgeObject/Relation，也没有增加任何 PPTX 写回命令。

`shared/file-formats.json` 中 PPTX 的真实能力已更新为：

- `capabilities.index = supported`
- `adapters.indexer = pptx`
- `userCapability.level = preview-only`
- `saveMode = none`

PPTX 仍是结构化只读格式；索引能力完成不等同于编辑能力完成。

## 2. 实现范围

### 2.1 共享搜索段模型

`src-tauri/src/formats/pptx.rs` 新增 `PptxSearchSegment` 和唯一的 `pptx_search_segments` 生成器，统一输出：

- 幻灯片标题；
- 幻灯片聚合正文；
- 具有文本、替代文本或表格文本的对象；
- 演讲者备注；
- 幻灯片页序；
- `pptx-slide` 或 `pptx-object` 定位类型；
- 稳定幻灯片/对象 ID；
- 用户可读的位置标签。

隐藏幻灯片会在位置标签中明确标识，不会被静默排除。

对象搜索文本会合并对象正文、图片替代文本和基础表格单元格文本。空文本、空备注和无可搜索内容的对象不会生成无效段。

### 2.2 持久化索引

`src-tauri/src/services/knowledge_index.rs` 新增 `build_pptx_index_segments`，负责把共享 PPTX 搜索段转换为 `IndexedSearchSegment`。

索引构建继续遵守：

- 96 MiB PPTX 文件上限；
- 384 MiB ZIP 展开预算；
- 2,000 张幻灯片上限；
- 100,000 个对象上限；
- 2,000,000 个可检索字符上限；
- 工作区路径守卫、敏感文件排除和可重建快照策略。

解析失败或超限文件不会绕过 PPTX 解析器进入通用文本索引。

### 2.3 实时扫描降级

`src-tauri/src/commands/index.rs` 的索引缺失、过期或构建阻断降级路径消费同一个 `build_pptx_index_segments`。

因此以下两种状态不再维护独立的 PPTX 遍历逻辑：

1. 有效知识索引快照；
2. 实时工作区扫描。

两条路径使用相同的匹配种类、页序、定位类型、对象 ID 和位置标签。

## 3. 搜索与定位合同

| 内容 | `matchKind` | `locatorKind` | `locatorObjectId` | `page` |
|---|---|---|---|---:|
| 文件名 | `title` | 无 | 无 | 无 |
| 幻灯片标题 | `slide-title` | `pptx-slide` | 源幻灯片 ID | 幻灯片序号 |
| 幻灯片正文 | `body` | `pptx-slide` | 源幻灯片 ID | 幻灯片序号 |
| 对象文本/替代文本/表格 | `object` | `pptx-object` | 源对象 ID | 所属幻灯片序号 |
| 演讲者备注 | `notes` | `pptx-slide` | 源幻灯片 ID | 幻灯片序号 |

C3C1 只负责生成稳定定位元数据。C3C2 才负责让 Library 路由和 `PptxReaderView` 消费这些字段、重复定位并高亮对象。

## 4. 验证证据

定向回归覆盖：

- PowerPoint 真实生产者 fixture 的标题、对象正文和备注；
- LibreOffice Impress 真实生产者 fixture 的搜索段生成；
- 幻灯片/对象稳定定位类型与 ID；
- 持久化索引与实时扫描结果逐字段一致；
- 索引构建和搜索后源 PPTX 字节不变；
- PPTX 仍保持无 writer、无创建器和无保存命令。

质量门禁：

- C3C1 定向 Rust 回归 `3/3`；
- 完整 Rust 功能回归 `324/324`；
- Rust 性能回归 `1/1`；
- Tauri Debug `--no-bundle` 桌面构建通过；
- 格式、主题、DOCX/PPTX 生产者、图谱、PDF、桌面证据、工作簿和 XLSX 门禁通过；
- A5 真实桌面证据仍为 `36/36` 项检查和 28 张截图；
- DOCX 生产者矩阵 `3/3`，PPTX 生产者矩阵 `2/3` 且 WPS 明确待补；
- 正式依赖漏洞为 0。

构建仍只有既有 Vite 大分包警告。本阶段没有新增桌面 UI，因而不伪造 C3C2 搜索跳转截图。

## 5. 明确边界

以下能力尚未完成：

- 搜索结果自动切换到目标幻灯片；
- 重复点击同一结果再次定位；
- 对象选中、滚动和高亮；
- PPTX 文件/幻灯片 KnowledgeObject 与 `contains` 关系；
- PPTX 共享关系侧栏；
- WPS Presentation 第三生产者；
- PPTX 基础编辑和可靠另存。

## 6. 下一开发入口

下一批进入 **C3C2 PPTX 精确定位**：

1. Library 搜索结果识别 `pptx-slide` 和 `pptx-object`；
2. 路由传递页序、稳定 ID 和一次性 `locatorToken`；
3. `PptxReaderView` 加载后选择目标幻灯片并滚动缩略图；
4. 对象结果选中并高亮目标对象；
5. 重复点击同一结果仍触发定位；
6. 覆盖标题、正文、对象、备注、隐藏页和重复定位回归；
7. 使用真实 Tauri/WebView2 补充搜索到 PPTX 的桌面证据。

C3C2 不增加 PPTX 写回；C3C3 对象关系和 C3C4 索引/桌面收口继续在其后独立验收。
