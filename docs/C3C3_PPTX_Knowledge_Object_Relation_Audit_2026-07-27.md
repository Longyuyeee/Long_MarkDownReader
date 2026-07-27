# LongEdit C3C3 PPTX 知识对象与关系审计

审计日期：2026-07-27

阶段：C3C3

阶段目标：让 PPTX 文件与幻灯片进入现有 KnowledgeObject、关系侧栏和知识图谱体系，不建立格式孤岛

## 1. 阶段结论

C3C3 已完成。PPTX 不再只是“能搜索、能定位的只读文件”，而是进入了统一知识管理模型：

1. PPTX 文件成为 `pptx` KnowledgeObject。
2. 每张幻灯片成为稳定的 `pptx_slide` KnowledgeObject。
3. 文件到幻灯片建立有向 `contains` 结构关系。
4. 实时图谱与持久化索引复用同一图谱快照，保持对象 ID、定位器和关系语义一致。
5. Library 右侧共享关系侧栏可按当前幻灯片聚焦；手动切换缩略图会同步上下文。
6. 从关系侧栏或知识图谱点击幻灯片，会继续在原有 Library 右侧 PPTX 工作区定位，不产生新的独立界面。
7. 当前幻灯片可作为知识图谱中心节点。

本阶段继续严格只读，没有增加 PPTX writer、保存命令或原件覆盖。

## 2. 实施审计

### 2.1 统一对象与关系模型

`src-tauri/src/commands/graph.rs` 的统一 `build_link_graph` 已扩展 PPTX：

- 文件对象 ID 继续使用规范化文件路径；
- 幻灯片对象 ID 使用 `knowledge_object_id(path, "pptx_slide", slide.id)`；
- 幻灯片父对象指向 PPTX 文件；
- 定位器保存 `pptx-slide`、生产者稳定 slide ID 和一基页序；
- 文件到幻灯片生成 `contains` 结构边；
- PPTX 解析失败或超出资源限制时安全跳过，不制造伪对象。

持久化索引的 `snapshot_from_graph` 直接消费相同节点与边，因此没有新增第二套 PPTX 对象表或关系表。

### 2.2 搜索、定位与图谱契约复用

`src-tauri/src/formats/pptx.rs` 新增共享 `pptx_slide_location_label`，搜索段与图谱对象共用同一位置标签。幻灯片搜索文本继续由 C3C1 的 `pptx_search_segments` 生成，避免搜索和图谱各自解释 PPTX。

对象稳定性回归同时验证：

- 1 个 PPTX 文件对象；
- 3 个幻灯片对象；
- 3 条 `contains` 关系；
- 实时图谱和持久化快照对象 ID、类型、定位器与关系一致；
- 真实 PowerPoint fixture 源字节不变。

### 2.3 共享关系侧栏

现有 `FileRelationContext` 已从“仅文件焦点”扩展为“文件或对象焦点”：

- Tauri 命令接受可选定位器类型、对象 ID 和页序；
- 缓存键包含对象焦点，文件和不同幻灯片不会互相污染；
- 当前节点为幻灯片时显示“幻灯片上下文”；
- 中心导航文案和目标变为“以当前幻灯片为中心”；
- 点击 PPTX 幻灯片关系节点时，复用 Library 内嵌路由和 C3C2 定位合同。

`PptxReaderView` 在加载、缩略图选择和路由定位时同步当前幻灯片；退出文件时清除对应对象焦点。

### 2.4 知识图谱回流

`GraphView` 已识别 `pptx` 与 `pptx_slide`：

- 图谱展示 PPTX 文件和幻灯片结构；
- 点击文件回到 Library 右侧 PPTX 工作区；
- 点击幻灯片携带 slide、locator、locationLabel 和一次性 locatorToken 精确回流；
- 不创建 PPTX 专属图谱页面。

## 3. 自动回归

新增或增强的门禁：

```text
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::graph::tests::pptx_file_and_slides_are_stable_graph_and_index_objects
npm run check:format-contract
npm run check:graph-product-contract
npm run check:c3c3-pptx-relations-evidence
```

契约检查固定以下边界：

- PPTX 必须进入统一图谱构建器；
- 幻灯片必须是 `pptx_slide` 对象；
- 搜索和图谱必须共享位置标签；
- 关系命令必须支持对象焦点；
- App 共享层必须转发对象焦点；
- 共享侧栏和图谱必须能回流 PPTX 幻灯片；
- 幻灯片选择必须同步共享关系上下文。

## 4. 真实 Tauri/WebView2 证据

独立审计命令：

```text
npm run audit:c3c3-pptx-relations
npm run check:c3c3-pptx-relations-evidence
```

审计使用隔离临时知识库和 Microsoft PowerPoint 16 真实生产者 fixture，通过 CDP 操作真实 Tauri Debug WebView2，结果为：

- 3/3 检查通过；
- 2 张 1280×820 截图；
- 第 1 张幻灯片显示对象级共享关系上下文；
- 切换第 2 张后，侧栏标题和关系同步更新；
- 关系类型为结构/包含；
- 提供以当前幻灯片为中心的图谱入口；
- 源 PPTX 字节未改变。

证据：

- [`pptx-slide-1-relation-context.jpg`](./evidence/c3c3-pptx-relations/pptx-slide-1-relation-context.jpg)
- [`pptx-slide-2-relation-context.jpg`](./evidence/c3c3-pptx-relations/pptx-slide-2-relation-context.jpg)
- [`audit-manifest.json`](./evidence/c3c3-pptx-relations/audit-manifest.json)

## 5. 完整质量门禁

`npm run ci:check` 已通过：

- 前端 TypeScript 与生产构建通过；
- 格式、主题、DOCX/PPTX 生产者、PPTX 定位/关系证据、图谱、PDF、桌面、工作簿与 XLSX 契约通过；
- Rust 功能回归 `326/326`，性能回归 `1/1`；
- 100 MiB PDF range 基准为 `51 ms / 255.9 KiB / 1 request`；
- 正式依赖漏洞为 0；
- 仅保留既有 Vite 大分包提示。

`npm run tauri -- build --debug --no-bundle` 已通过，生成真实桌面应用 `src-tauri/target/debug/tauri-app.exe`。

## 6. 需求对齐

对“日常管理与基础编辑 + 成体系管理”的贡献：

- 日常阅读：PPTX 继续在原有右侧工作区结构化阅读和定位。
- 日常查找：文件名、标题、正文、对象、表格与备注均可进入统一搜索。
- 体系管理：PPTX 文件和幻灯片现在可被知识图谱、关系侧栏和持久化索引统一管理。
- 基础编辑：本阶段没有虚假提升；PPTX 仍为结构化只读，基础对象编辑属于 C4。

## 7. 能力边界

尚未完成：

- C3C4 索引删除、重建、过期降级、资源上限和综合桌面收口；
- WPS Presentation 第三生产者证据；
- 幻灯片内部 shape 级持久化 KnowledgeObject；
- PPTX 文本、基础样式和安全对象的受限编辑与可靠另存；
- WPS 原生格式、旧版 Office 与 OpenDocument 后续格式矩阵。

本阶段选择“幻灯片级对象”作为稳定产品边界。shape 仍可搜索和精确定位，但在缺少跨生产者稳定身份保证前，不升级为长期持久化图谱对象。

## 8. 下一开发入口

下一批进入 **C3C4 PPTX 索引与桌面综合收口**：

1. 验证文件删除、重命名和内容变更后的陈旧对象清理；
2. 验证显式重建、自动重建和索引未就绪时的实时回退；
3. 对大幻灯片数、大对象数、压缩包膨胀和搜索文本建立可测资源上限；
4. 用真实 PowerPoint/LibreOffice fixture 覆盖搜索→定位→关系→图谱→回流完整链路；
5. 固定失败降级、源文件不变、缓存隔离和 UI 状态；
6. 完成全量质量门禁与 Tauri 构建。

C3C4 收口后再进入 C3D 生产者矩阵补齐；PPTX 基础编辑继续按 C4 的受限子集和可靠另存门禁推进。
