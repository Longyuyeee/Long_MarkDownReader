# Post-v1.0.15 M4A-1 统一对象定位与 Table/OPML 搜索闭环审计

日期：2026-08-28

分支：`main`

开发目标：`1.0.16`

运行时与公开版本：`1.0.15`

发布状态：`releaseCandidate=false`

## 1. 结论

M4A-1 已完成并通过合同、Rust、前端构建和真实 Tauri/WebView2 审计。资料库搜索、知识图谱和关系上下文现共同使用 `fileNavigation` 的对象定位合同；Table 行/视图与 OPML 节点同时进入持久索引和 live fallback，并可从搜索结果打开内部对象。

原有 DOCX、ODS、ODP、PPTX 精确定位与返回搜索上下文没有回归。真实审计完成 6 次内部对象打开与 6 次返回，运行时错误为 0，6 个源夹具 SHA-256 均未变化。

## 2. 实现与需求对齐

| 原始退出条件 | 实际结果 |
| --- | --- |
| 三个入口共享统一定位合同 | `LibraryMode`、`GraphView`、`FileRelationContext` 均调用 `openManagedObject`；10 类路由映射由一个合同检查执行 |
| Table 内容搜索并打开指定行/视图 | 索引生成 `table-row` 与 `table-view`；真实搜索定位 `roadmap-row`，即使保存筛选原本排除该行也会临时显示并选中 |
| OPML 内容搜索并打开指定节点 | 递归生成 `opml-node` 索引段；真实搜索打开稳定 ID `workflow-node`，思维导图选中节点且检查器显示同一 ID |
| 既有 Office 精确定位无回归 | DOCX `docx-block-6`、ODS `ods-sheet-2:A1`、ODP `odp-slide-1`、PPTX 对象 `3` 均真实打开 |
| 返回后保持搜索状态 | 6/6 次返回均保留原搜索词和结果 |
| 源文件与运行安全 | 6 个夹具前后摘要一致；0 运行时错误；无阻断错误界面 |

知识索引 schema 从 1 提升到 2，缓存目录同步切换到 v2。这是必要迁移：否则旧文件级 Table/OPML 缓存会绕过新内部段合同。版本变化仅属于本地派生缓存，不改变用户文件格式或应用公开版本。

## 3. 纠偏记录

第一次真实审计使用了不存在的通用 ODF 根类名；实际组件为 `.odf-workspace`。审计已改为核对真实根容器与目标单元格/幻灯片的 `.route-target`，没有为通过测试修改产品行为。

第二次审计发现 `structured slide reading` 会正确同时命中 PPTX 幻灯片与内部对象。审计最初点击首条结果，因此不能证明对象定位；现明确选择“对象”结果，并核对对象 ID 与活动幻灯片。该差异同样属于审计假设纠正。

## 4. 验证证据

- 合同：`npm run check:post-v115-m4a1-unified-object-navigation`
- 前端：`npm run build`
- Rust：`cargo test --manifest-path src-tauri/Cargo.toml commands::index::tests` 与 `cargo test --manifest-path src-tauri/Cargo.toml services::knowledge_index::tests`
- 真实桌面：`npm run audit:post-v115-m4a1-unified-object-navigation`
- 交互记录：`docs/evidence/post-v115-m4a1-unified-object-navigation/interaction-evidence.json`
- 截图：Table 目标行、OPML 目标节点、PPTX 对象定位三张 1280×820 真实 WebView2 画面，均已人工复核。

## 5. 范围边界与下一接续点

本阶段没有扩大 DOCX/ODS/ODP/Workbook 图谱，没有增加工作台对象行动，没有重做转换 UI，没有增加新转换类型，也没有提升应用版本或进入 release candidate。

下一步唯一接续点为 **M4A-2：M1 对象图谱定位扩面选择审计**。先对照 M1 已完成对象与当前图谱节点/边/mention 事实，选择一个最小、可真实定位的扩面批次；不得未经选择审计一次性把所有格式、工作台行动和转换流程混入。
