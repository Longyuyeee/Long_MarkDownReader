# Post-v1.0.15 M4A-6 M1 对象定位覆盖退出审计

日期：2026-08-28

分支：`main`

开发目标：`1.0.16`

运行时与当前公开版本：`1.0.15`

发布状态：`releaseCandidate=false`

## 1. 结论

M4A-6 已通过，M4A 的统一搜索与有界图谱定位阶段完成退出。真实 schema v2 索引和同一 Tauri 资料库覆盖 7 类搜索定位器、7 类图谱子对象、Graph 与关系上下文两个图谱入口，以及全部返回上下文。

本阶段没有扩大图谱粒度：普通 DOCX block 与 ODS cell 仍是精确搜索对象，不是图谱节点。下一接续点为 **M4B-0 工作台对象行动选择审计**；先选择小而安全的行动批次，不直接实现全对象行动，也不混入转换或发布冻结。

## 2. 初始需求与实际代码对齐

| 项目 | 原始要求 | 开发前代码事实 | 修正后实际 |
| --- | --- | --- | --- |
| 搜索定位 | Table、OPML、DOCX、ODS、ODP、PPTX、Workbook 可定位内部对象 | 7 类定位器均由 schema v2 索引生成并进入共享导航；M4A-1 的真实回归只记录了前 6 类，Workbook 在 M4A-2 单独验证 | 同一真实流程 7/7 精确打开、7/7 返回搜索状态 |
| 图谱定位 | 已选择的 7 类有界对象可从 Graph 打开 | `table_view`、`opml_node`、`pptx_slide`、`odp_slide`、`workbook_sheet`、`ods_sheet`、`docx_heading` 均有稳定 locator 和显式语义 | 7/7 从 Graph 精确打开并返回 |
| 关系上下文 | 与 Graph 使用同一定位合同 | 两个入口均调用 `openManagedObject`，后端按 locator 聚焦 | 7/7 从父文件上下文打开内部对象并返回 Graph |
| 粒度边界 | 搜索细粒度与图谱有界粒度不得混淆 | DOCX block/ODS cell 只在搜索索引，图谱只取 heading/sheet | 22 节点中细粒度延期节点为 0 |
| 稳定与安全 | 同源身份稳定、结构边不伪造 mention、源文件不变 | 分阶段测试已存在，尚无统一退出流程 | 重复构建身份一致，15 条 `contains` mention 为 0，7 个源文件摘要不变 |

## 3. 审计中发现并修复的问题

### 3.1 Workbook 搜索退出口径补齐

M4A-1 的回归集合是 Table、OPML、DOCX、ODS、ODP、PPTX 六类；Workbook 工作表搜索在 M4A-2 被单独验证。M4A-6 不沿用 6/6，而是按 M4 原始范围合并为 7/7。

### 3.2 索引重复重建时序

首次脚本在 Library 自动准备索引尚未完成时又调用重建，后端正确拒绝并发任务。审计改为等待自动 schema v2 索引进入 `ready`，再读取状态并开始搜索。这是审计时序修正，不改变产品门禁。

### 3.3 PPTX 父文件关系上下文残留幻灯片焦点

真实流程先打开 PPTX 幻灯片、返回 Graph，再打开 PPTX 父文件时，后端无焦点调用正确返回父节点，但前端仍显示旧幻灯片的“内部对象上下文”。原因是 `PptxReaderView` 每次加载都会无条件把当前幻灯片写回共享关系焦点，即使路由没有内部 locator。

现已改为：只有显式路由定位或用户选择幻灯片时同步幻灯片焦点；无内部 locator 的 PPTX 路由主动清除焦点。修复后父文件显示“文件上下文”，再从关系项进入幻灯片时显示“内部对象上下文”。

### 3.4 M4A-2 历史选择门禁演进

阶段回归发现 M4A-2 检查器仍要求 ODP/Workbook 图谱实现永远不存在，与已经验收的 M4A-3 继任阶段冲突。检查器现保留 M4A-2 当时“候选节点为 0”的不可改写证据，同时验证 M4A-2→M4A-3 批准链、当前 dispatch 和显式语义；没有放宽当时的选择事实。

## 4. 真实结果

- 索引：schema v2，22 个对象，15 条关系。
- 搜索：7 类 locator，7/7 精确打开，7/7 返回并保留搜索状态。
- 图谱：7 个父节点、15 个子节点、15 条 `contains`；子对象族 7/7。
- 子节点分布：Table view 1、OPML node 2、DOCX heading 1、ODS sheet 2、ODP slide 2、PPTX slide 3、Workbook sheet 4。
- Graph：7/7 内部对象精确打开。
- 关系上下文：7/7 从父文件打开内部对象。
- 返回：14/14 回到原 Graph 选中节点。
- 稳定性：同一源重复构建的子节点 ID 与 parent ID 一致。
- 边界：`docx_block` / `ods_cell` 图谱节点 0；15 条结构边 mention 0。
- 安全：运行时错误 0、阻断错误界面 0、7 个源文件摘要全部不变。

人工复核的四张截图覆盖 Workbook 搜索定位、22 节点图谱、OPML 内部对象上下文和 Workbook 内部对象上下文；没有本机临时路径泄漏或不可达操作。证据位于 `docs/evidence/post-v115-m4a6-m1-object-location-coverage-exit/`。

## 5. 验证命令

- `npm run build`
- `npm run check:pptx-locator`
- `npm run audit:post-v115-m4a6-m1-object-location-exit`
- `npm run check:post-v115-m4a6-m1-object-location-exit`
- `npm run check:graph-product-contract`
- `npm run check:development-version-identity`
- `git diff --check`

## 6. 下一接续点

**M4B-0：工作台对象行动选择审计**。

开始前应以 `WorkspaceHome` 的实际行动队列、现有 Markdown 待办/PDF 批注能力、M1 新对象的可安全操作范围和写回冲突合同为事实源，只选择一个最小完整批次。转换披露、新转换类型、版本提升和 release candidate 继续延期。
