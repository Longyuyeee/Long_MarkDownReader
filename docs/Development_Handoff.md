# Long Markdown Reader 开发交接

更新日期：2026-07-22
交接基线：专业知识工作区已进入 `main`，当前开发版本 `v0.7.0`

## 1. 新电脑快速恢复

### 环境要求

- Windows 10/11 x64
- Git 与 GitHub CLI（`gh auth login`）
- Node.js 与 npm；安装依赖时使用 `npm ci`
- Rust stable、Cargo，以及 Tauri 2 在 Windows 上需要的 WebView2 与 MSVC 构建工具

### 拉取与验证

```powershell
git clone https://github.com/Longyuyeee/Long_MarkDownReader.git
cd Long_MarkDownReader
git fetch --all --prune
git switch main
npm ci
npm run ci:check
npm run tauri -- build --debug --no-bundle
```

桌面端调试运行：

```powershell
npm run tauri -- dev
```

Debug 构建输出位于 `src-tauri/target/debug/tauri-app.exe`，该目录属于本机构建产物，不进入 Git。

## 2. 当前产品能力

- Markdown 编辑、双向链接、反向链接、标签、历史版本和 Git 同步。
- 全局/局部知识图谱、图谱健康检查、关系筛选、链接修复与图谱到 Canvas 转换。
- JSON Canvas 可视化编辑，以及 Markdown、文件、Mermaid、表格图表等节点。
- Mermaid Diagram Studio，支持结构化编辑、预览与 SVG/PNG 导出。
- CSV/TSV 和开放 `.table.json` 表格编辑、图表、仪表盘、Markdown/Canvas 嵌入。
- XLSX 多工作表预览、空白/已有基础单元格编辑、连续/多区域、TSV 剪贴板、基础样式、公式重算、行高列宽和合并/取消合并，支持冲突检测及 OOXML 局部可靠写回；可将工作表转换为开放表格。
- PDF 分段读取、阅读、标注、OCR sidecar、全文索引和图谱关系。
- API Key 使用 Windows 系统凭据存储；旧配置中的明文 Key 会一次性迁移并清除。

## 3. 后端结构

- `src-tauri/src/lib.rs`：仅保留 Tauri 应用装配、托盘/窗口事件、URI 协议与命令注册。
- `src-tauri/src/commands/`：按 AI、Canvas、配置、图表、文件、Git、图谱、历史、索引、PDF、搜索、系统、表格和工作簿拆分的 IPC 命令。
- `src-tauri/src/formats/`：Canvas、Diagram、Markdown、PDF 标注/OCR、开放表格格式适配与验证。
- `src-tauri/src/services/`：系统凭据、数据迁移、PDF 索引、可靠写入、`WorkspaceGuard` 和外部单文件授权状态。

FR-BASE-004 已验收：按项目既有统计口径，`lib.rs` 从 2,257 行降至当前 292 行，Rust 业务测试随模块放置。

## 4. 关键设计文档

- `docs/Product_Requirements_and_Development_Roadmap.md`：需求状态、验收标准和实施批次，是后续开发的主路线图。
- `docs/Professional_Knowledge_Workspace_Design.md`：产品定位、整体架构与专业管理系统设计。
- `docs/Open_Table_Format_Spec.md`：开放表格文件格式。
- `docs/Table_Chart_Reference_Spec.md`：图表引用和嵌入规范。
- `docs/XLSX_Compatibility_Boundary.md`：XLSX 能力边界。
- `docs/Workbook_Engine_Interface.md`：完整工作簿内核契约、能力矩阵和 XLSX fixture 门禁。
- `docs/Credential_Storage_Security.md`：凭据安全模型和迁移方式。
- `docs/Mermaid_Diagram_Workspace.md`：Diagram Studio 行为与兼容边界。
- `docs/Knowledge_Object_Relation_Contract.md`：统一图谱对象身份、定位、关系和格式适配边界。
- `docs/Local_Knowledge_Index_Contract.md`：可重建缓存、状态、失效、安全和规模边界。
- `docs/Professional_Workspace_Home.md`：默认工作台的数据来源、扫描边界和验收约束。
- `docs/Saved_Search_Collections.md`：智能集合的配置模型、动态求值和安全边界。
- `docs/Knowledge_Workspace_Health.md`：重复文件、未处理批注、扫描预算和只读治理边界。
- `docs/Workbook_Row_Column_Outline.md`：XLSX 行列隐藏、分组、可靠写回和保真边界。
- `docs/Workbook_Structure_Migration.md`：XLSX 行列插删的坐标、范围、公式迁移规则和预览边界。

## 5. 验证基线

当前本地候选验证结果：

- 前端生产构建、主题/格式/工作簿/XLSX 发布契约检查均通过。
- Rust：S8-1B2B2 后共 137 项功能与性能测试；回归覆盖工作表内复杂载体、Table、Chart、Drawing anchors、calcChain、完整范围对象删除及真实包语义重读。
- 本批本机在整机 CPU 持续约 100% 的资源竞争下测得 `inspect=601 ms / page=16,396 ms / patch=10,960 ms / total=27,958 ms`，功能回归全部通过但分页项超过 Debug 预算；上一无竞争基线为 `325 / 6,442 / 4,568 / 11,336 ms`。去除分页路径的重复 ZIP 解包后，GitHub Quality Gate #29899168408 独立 runner 以 `296 / 6,842 / 5,105 / 12,244 ms` 通过全部预算。
- 100 MiB PDF 范围读取基准：131 ms，仅读取约 256 KiB（目标小于 2 秒；不同机器会有波动）。
- `npm audit --omit=dev`：0 个漏洞。

Vite 仍会提示少数 Mermaid/UI 分包压缩后超过 500 KiB；这是性能优化项，不是构建失败。

## 6. 下一阶段顺序

完整阶段审计、设计对齐和后续交错排期见 `docs/Development_Stage_Audit_2026-07-20.md`。当前工作区已完成 S6-8、T7-1、F7-1、S6-9、F7-2、S6-10～S6-15、G7-2、G7-3、I7-1、I7-2、W7-1～W7-3、S8-1A、S8-1B1 与 S8-1B2A～S8-1B2B2；下一入口为 S8-1B3 / FR-DATA-009。

当前 `v0.7.0` 基线已完成知识库文件树的创建、移动、重命名、删除、排序、扫描和状态读取路径守卫，并修复旧 API Key 迁移失败丢失及远程 HTTP 传输风险。

1. 完成 FR-BASE-001/007：拖拽导入现由 Rust 系统事件授权；历史缓存区分知识库与外部文档；图片读取要求被当前 Markdown 精确引用。下一批继续审计少量平台和导出命令。
2. FR-INDEX-004/FR-FORMAT-001 已完成：前后端消费 `shared/file-formats.json`，创建、打开、工作区扫描、外部授权和索引均由能力与适配器契约分派；`.txt` fixture 证明同类格式扩展不再修改根级白名单。
3. FR-DATA-009 的 S6-11 已完成冻结窗格读取/可靠写回、最多 50,000 行的非破坏性排序筛选、Excel Table 结构呈现，以及字面量列表和基础标量数据验证；Table 结构编辑、持久化排序条件与公式/自定义验证仍未开放，边界见 `XLSX_Public_Compatibility_Matrix.md`。
4. T7-1 已完成：唯一主题注册表、专业浅色/深色/高对比预设、统一持久化、编辑器/图表消费者与结构门禁已交付；视觉矩阵见 `docs/Theme_Preset_Contract_and_Visual_Matrix.md`。
5. F7-2 已完成：OPML 树形/思维导图双视图、拖拽层级、折叠、搜索、撤销重做、可靠往返、语义索引和 Canvas 投影已交付；兼容边界见 `docs/OPML_Mind_Map_Editor_Design.md`。
6. G7-2 已完成：全局图谱节点详情可直接建立和删除七类语义关系，关系可靠写入 Markdown Frontmatter；路径、关系类型、内容签名、删除证据和原子写入均由后端验证。
7. FR-DATA-009 的 S6-12 已完成：读取图表/图片关系、锚点、标题和系列来源，工作面提供结构卡片与定位；对象编辑和像素级渲染仍未开放，单元格写回通过 Drawing/Chart/媒体逐字节保真门禁。
8. FR-DATA-009 的 S6-13 已完成：透视表、切片器、外部链接和数据连接进入脱敏结构清单；外部目标不跟随，敏感连接内容不进入 IPC，刷新/计算/交互编辑仍未开放。
9. FR-DATA-009 的 S6-14 已完成：打印区域、页面设置、页眉页脚与保护状态进入只读摘要；保护材料不进入 IPC，受保护 Sheet 写回整批拒绝，打印预览、布局编辑和解锁仍未开放。
10. FR-DATA-009 的 S6-15 已完成：复杂 fixture 全包差异白名单、10,000×12 性能预算和机器发布档案进入 CI；总体 XLSX 往返仍为计划，不宣传完整 Excel 等价。
11. G7-3 已完成：OPML 主题、Canvas 节点、PDF 批注和 Table 视图成为可寻址图谱对象，跨格式结构关系与精确打开链路已交付。
12. I7-1 已完成：版本化本地快照支持状态、进度、源签名失效、显式重建和删除，用户文件继续作为唯一事实源。
13. I7-2 已完成：跨格式全文搜索优先消费有效快照，保留 PDF 正文页、OCR 页和批注定位，并在旧、缺失、损坏或过期时实时扫描降级。
14. W7-1 已完成：默认专业工作台聚合收藏、最近、待办、常用 Canvas、图谱健康和索引状态；概览扫描受格式注册表、路径守卫、条目数和文件大小约束。
15. W7-2 已完成：跨格式查询和格式过滤器可保存为设备级智能集合，从侧栏或工作台重开时动态求值；Rust 后端限制数量、长度、格式与知识库归属。
16. W7-3 已完成：治理队列汇总精确重复文件和未进入 Markdown 引用的 PDF 批注；结果只读、可回到源对象，扫描具有明确条目、文件、哈希和结果上限。
17. S8-1A 已完成：整行整列支持隐藏、取消隐藏和 0–7 级大纲分组；独立结构事务保留宽高和其他属性，旧签名、越界层级及受保护 Sheet 整批拒绝。
18. S8-1B1 已完成：独立迁移内核和 Tauri 预览命令支持行列插删后的绝对/相对 A1 引用、范围扩缩、跨 Sheet 判定、整行整列范围和 `#REF!`；当前不修改 XLSX。
19. S8-1B2A 已完成：普通目标 Sheet 的整行插删包级事务覆盖行、单元格、维度、跨 Sheet 公式和定义名称，旧签名及复杂目标载体整批拒绝；当前仅提供后端命令。
20. S8-1B2B1 已完成：工作表 XML 内的合并、验证、筛选、冻结、选择状态、条件格式和超链接随整行插删迁移。
21. S8-1B2B2 已完成：Table、图表公式、Drawing 行锚点和计算链进入包级迁移；完整范围对象可删除并同步父节点计数，完整 Table 删除及高风险对象仍明确拒绝。
22. 下一批 S8-1B3 / FR-DATA-009：将整行插入/删除接入前端选择、保存、重算和重载流程，再继续整列事务。
23. 完善 FR-BASE-005：增加关键保存流程 E2E、格式 fixture 和视觉回归门禁。

开始新功能前先更新路线图中的需求状态与验收条件；每个阶段至少执行 `npm run ci:check`，涉及桌面端注册或 Rust 命令变更时再执行完整 Tauri 构建。

## 7. 已知边界与注意事项

- 当前重点是本地优先和开放文件格式，不引入私有数据库作为唯一事实源。
- XLSX 当前已具备基础单元格、连续/多区域、当前工作区整行整列、填充柄、公式引用迁移、按需依赖重算、基础样式、持久化行高列宽和合并区域编辑能力；高级样式、更多工作表结构和完整公式等价尚未完成，不能提前宣传为 Excel 等价编辑器；完整等价编辑按兼容矩阵逐项验收。
- PDF 标注和 OCR 使用 sidecar 文件，不直接重写原 PDF。
- OPML 主题、Canvas 节点、PDF 批注和 Table 视图已是全局图谱中的独立对象；本地索引支持持久化全量重建、签名失效检测和页级跨格式全文搜索，尚未实现文件级增量更新。
- 不要提交 `.claude/settings.local.json`、系统凭据、知识库内容、`dist/` 或 `src-tauri/target/`。
