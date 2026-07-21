# KnowledgeObject / Relation 统一契约

更新日期：2026-07-21
实施批次：G7-3 / FR-GRAPH-008

## 1. 目标

知识图谱不再只把文件视为节点。Markdown、PDF、Open Table、JSON Canvas 和 OPML 通过格式适配器输出统一的图谱元数据，同时继续以用户文件和公开 sidecar 为事实源。当前契约是可重建索引的输入模型，不是私有数据库格式。

## 2. 对象身份

- 文件对象继续使用知识库内规范化绝对路径作为 ID，保持现有图谱、布局和打开行为兼容。
- 文件内部对象使用 `longedit-object:{kind}:{pathDigest}:{encodedNativeId}`。
- `pathDigest` 是文件规范路径的 MD5 摘要，只用于稳定命名空间，不承担安全校验。
- `nativeId` 必须来自源格式：PDF 批注 ID、Table 视图 ID、Canvas 节点 ID 或 OPML `_longeditId`。
- 文件移动会改变对象 ID；源格式内部对象只要保留原生 ID，在同一路径下即可保持稳定。

统一节点字段包括 `id`、`title`、`path`、`objectType`、`searchText`、`parentId`、`locator` 和 `locationLabel`。`locator` 保存 `kind`、`objectId` 及 PDF 可选页码，供前端精确导航。

## 3. 格式适配器

| 格式 | 文件对象 | 细粒度对象 | 自动关系 |
|---|---|---|---|
| Markdown | `markdown` | 暂无独立段落对象 | Wikilink、Frontmatter 语义关系、PDF 批注引用 |
| PDF | `pdf` | `pdf_annotation` | PDF `contains` 批注；Markdown `annotates` 批注 |
| Open Table | `table` | `table_view` | Table `contains` 视图；Dashboard `embeds` Chart |
| JSON Canvas | `canvas` | `canvas_node` | Canvas `contains` 节点；内部边及文件节点 `embeds` 目标对象 |
| OPML | `opml` | `opml_node` | 文档和主题父子层级使用 `contains` |

Canvas 文件节点携带 `longeditViewId` 时直接指向 Table 视图，否则指向文件对象。Markdown 指向已删除 PDF 批注时降级到 PDF 文件节点，避免历史引用从图谱静默消失。

## 4. 精确打开

- `pdf_annotation`：打开 PDF，并传入 `page` 与 `annotation`。
- `table_view`：打开 Table，并切换到 `view`。
- `canvas_node`：打开 Canvas，并选中 `node`。
- `opml_node`：打开思维导图，并选中 `node`。

图谱筛选和对象详情使用细粒度 `objectType` 与 `locationLabel`。结构关系没有 Markdown 语法证据时显示“结构关系”，不伪造 Wikilink 来源。

## 5. 安全与规模边界

- 所有路径仍由知识库边界和规范路径约束；Canvas 外部、绝对或穿越引用不会进入关系图。
- PDF 批注沿用 5,000 条上限，OPML 沿用 10,000 节点和 64 层上限，Table 沿用 64 个视图上限。
- Canvas 图谱适配每个文件最多消费 5,000 个节点和 5,000 条边，源文件读写上限仍为 20 MB。
- 无效或不受支持的格式文件不生成部分可信的细粒度对象。

## 6. 当前边界与下一步

I7-1 已将统一对象和关系写入可删除重建的 schema v1 本地快照，并提供源签名失效、状态、进度和可靠替换。I7-2 已加入跨格式搜索段与 PDF 正文页、OCR 页、批注定位，并在快照不可用时回退实时扫描。快照不是用户内容事实源，详细契约见 `Local_Knowledge_Index_Contract.md`；文件级增量更新仍未实施。
