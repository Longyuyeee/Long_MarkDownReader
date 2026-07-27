# A5 真实桌面验收收口审计

更新日期：2026-07-27

开发分支：`codex/a4-format-closure`

对应 Draft PR：#6

审计结论：**统一文件管理阶段 A 的核心桌面路径达到收口条件，可以进入知识图谱产品化专项。**

## 1. 本阶段回答的问题

A5 不再以“代码里存在某个命令”作为完成依据，而是在真实 Tauri Debug 进程和 WebView2 中验证用户能否完成日常管理与基础编辑：

1. 文件可被正确识别并进入对应工作面；
2. 普通文本、配置、代码和结构化源码可编辑、保存、离开后重开；
3. 外部修改、非法结构、敏感配置和大文件不会被静默误处理；
4. 日志追加与轮转能够在运行中的桌面工作面反映；
5. 关闭真实应用进程后，最近文件状态能够恢复并再次打开；
6. 所有证据来自隔离临时知识库，不接触用户正式文件或正式 WebView 配置。

本阶段不等于完整发布验收，也不把局部能力宣传成 Office、WPS、IDE 或 PDF 排版编辑器等价。

## 2. 真实桌面验收结果

自动化命令：

```powershell
npm run audit:a5-desktop
npm run check:a5-desktop-evidence
```

阶段 A 收口后，G8-1/G8-2A/G8-2B、PDF B0/B1A/B1B/B1C 和 DOCX C0-2A/C1-2B 继续复用同一真实桌面回归框架。当前门禁结果为 **35/35 项通过，27 张真实 Tauri 截图通过机器校验**。

| 验收域 | 真实桌面结果 | 证据 |
|---|---|---|
| Library 右侧结构 | 日常格式保留左侧管理器并嵌入右侧；JSON/Text 标签互切不离开 Library | `configuration-and-code-save-reopen.jpg` |
| G8-1 关系摘要 | 当前文件、工作台最近文件和搜索结果显示关系摘要；点击后图谱以目标文件居中 | `g8-current-file-relation-summary.jpg`、`g8-workspace-relation-summary.jpg`、`g8-search-relation-summary.jpg`、`g8-centered-graph-navigation.jpg` |
| G8-2A 关系上下文 | Markdown 显示事实链接与原文证据；OPML 显示规划层级；共享侧栏不离开当前工作面 | `g8-file-relation-context.jpg`、`g8-opml-planning-context.jpg` |
| G8-2B 上下文补全 | 同标签与智能集合进入侧栏；PDF、Table、Canvas 的真实对象关系和定位进入桌面门禁 | `g8-tag-and-collection-context.jpg`、`g8-pdf-object-context.jpg`、`g8-table-object-context.jpg`、`g8-canvas-object-context.jpg` |
| PDF B0 页面整理草稿 | 两页 PDF 完成旋转、改序、排除、撤销、重做和重置；源文件保持只读 | `b0-pdf-page-plan-preview.jpg` |
| PDF B1A 隔离副本验证 | 页面计划在内存中生成可复读 PDF；结构、文本页序和源字节通过复核，仍不提供保存 | `b1a-pdf-isolated-copy-verification.jpg` |
| PDF B1B 可靠另存 | 原子创建同目录新副本，磁盘复读后由 PDF.js 打开；源文件逐字节不变 | `b1b-pdf-reliable-save-reopen.jpg` |
| PDF B1C 兼容画像 | 原工作面显示版本、xref、压缩对象、页面继承与无文本页画像 | `b1c-pdf-compatibility-profile.jpg` |
| DOCX C1-2A | 在原 Library 右侧显示目录、继承标题、编号列表、结构化正文、表格、受限真实图片、搜索定位、兼容画像和高级对象只读警告 | `c1-docx-structured-reading.jpg` |
| DOCX C1-2B2 | 在真实 WebView2 中显示横向/纵向合并单元格、分页、横向双栏节摘要，并搜索定位批注附属内容 | `c1-docx-layout-and-related-content.jpg` |
| DOCX C0-2A | 在真实 WebView2 中打开 Microsoft Word 16 生产者文件，验证生产者、合并表格、横向双栏、媒体和批注搜索 | `c0-word-producer-reading.jpg` |
| 普通文本/INI | 编辑、保存、离开并重开成功 | `text-save-and-reopen.jpg` |
| 外部修改冲突 | 保存被签名冲突阻断；选择重新加载后读取磁盘版本，不恢复旧草稿 | `external-conflict-detected.jpg` |
| `.env` | 首次遮罩、明确确认后显示、再次遮罩成功；正文标记不泄漏到界面 | `env-default-masked.jpg` |
| JSON | 非法源码首次保存被阻断，磁盘保留最后合法版本；修复后保存成功 | `json-invalid-save-protected.jpg` |
| Properties/TypeScript | 可靠保存并通过路由重开；代码保持轻量编辑边界 | `configuration-and-code-save-reopen.jpg` |
| YAML/XML/TOML | 分别通过权威语法工作面保存并重开 | `structured-formats-save-reopen.jpg` |
| 搜索与智能集合 | 普通代码标记可搜索并保存为集合；`.env` 标记不可搜索 | `env-search-excluded.jpg` |
| 24 MiB TXT | 自动进入有界只读范围模式，只读取 512 KiB，保存被禁用 | `large-text-bounded-readonly.jpg` |
| LOG | 追加内容自动刷新；文件截断/轮转后丢弃旧缓冲并重新读取 | `log-append-and-rotation.jpg` |
| 进程重启 | 杀掉第一轮真实应用进程，以同一隔离配置重启，从最近文件重新打开日志 | `restart-recent-file-restored.jpg` |

机器清单位于 `docs/evidence/a5-stage-a/audit-manifest.json`。门禁同时校验运行环境标识、检查项集合、截图数量与大小、大文件 24 MiB/512 KiB 事实以及真实进程重启时间。

右侧统一工作区的根因、空间模式和视觉合同见 `docs/Library_Right_Pane_Workspace_Audit_2026-07-26.md`。
G8-1 的目标、路径身份修复、关系摘要合同和边界见 `docs/G8_1_Relation_Summary_Product_Audit_2026-07-26.md`。
G8-2A 的统一侧栏、分类、证据、生命周期修复和边界见 `docs/G8_2A_File_Relation_Context_Audit_2026-07-26.md`。
G8-2B 的同标签、智能集合、有界缓存、专业格式证据和需求重排见 `docs/G8_2B_Relation_Context_Closure_Audit_2026-07-26.md`。
PDF B0 的页面身份、非破坏式计划、历史、离开保护和未开放写回边界见 `docs/B0_PDF_Page_Plan_Audit_2026-07-27.md`。
PDF B1A 的引擎决策、许可证、风险矩阵、隔离生成与下一门槛见 `docs/B1A_PDF_Isolated_Write_Engine_Audit_2026-07-27.md`。
PDF B1B 的无覆盖写入、落盘复读、桌面重开和 B1C 入口见 `docs/B1B_PDF_Reliable_Save_Audit_2026-07-27.md`。
PDF B1C 的对象流、页面继承、扫描页、风险阻断矩阵与 DOCX 入口见 `docs/B1C_PDF_Compatibility_Closure_Audit_2026-07-27.md`。
DOCX C0/C1 首批的解析预算、结构模型、工作面设计、明确边界和后续收口顺序见 `docs/C0_C1_DOCX_Structured_Reading_Audit_2026-07-27.md`。
DOCX C1-2B 的最终只读收口、版式桌面证据与真实生产者缺口见 `docs/C1_2B2_DOCX_Layout_Desktop_Audit_2026-07-27.md`。
DOCX C0-2A 的 Microsoft Word 真实生产者版本、隐私处理、重开、哈希和解析证据见 `docs/C0_2A_Microsoft_Word_Producer_Fixture_Audit_2026-07-27.md`。

## 3. 本阶段发现并修复的问题

外部冲突对话框原来的“重新加载”会调用普通加载路径；普通加载路径优先恢复标签中的脏草稿，因此用户虽然选择了重新加载，看到的仍可能是内存旧内容。

现已把“普通进入工作面”和“明确丢弃草稿后从磁盘重读”拆成不同调用语义：

- 路由恢复仍可保留未保存草稿；
- 外部冲突对话框的“重新加载”明确跳过草稿；
- 用户主动按指定编码重读时同样读取磁盘事实源；
- 真实桌面证据同时断言外部版本出现、旧草稿消失。

这项修复避免了冲突对话框行为与文字承诺不一致。

## 4. 能力边界

### 已达到日常管理与基础编辑

- 统一文件树、标签页、最近文件、全文搜索和智能集合；
- TXT、常见配置、代码文本、JSON/JSONC、YAML、XML、TOML 的可靠基础编辑；
- `.env` 默认遮罩和后端索引隔离；
- LOG 有界只读、筛选、追尾、自动刷新和轮转；
- PDF 阅读/批注/OCR、页面整理及可靠另存安全子集、Mermaid 图表、OPML 思维导图、JSON Canvas、开放表格和渐进式 XLSX 能力继续有效；
- 30 类格式、62 个扩展名由共享注册表统一声明能力与路由；DOCX 当前声明为结构化只读。

### 仍不能宣称

- PDF 已达到任意复杂对象保真或正文排版编辑；
- DOCX/PPTX/WPS 私有格式的内置可靠编辑；DOCX 当前仅达到结构化只读首批；
- 完整 Excel 等价、完整 IDE、任意私有思维导图格式等价；
- 安装包升级/卸载、系统文件关联、所有 Windows 版本和硬件组合已经完成发布矩阵；
- 知识图谱已经具备完整代码语义提取或图谱—思维导图双向协同。

JSON、YAML、XML、TOML 仍保留“明确二次确认后按非法源码保存”的专业编辑逃生口；默认第一次保存不会覆盖最后合法版本。该行为必须继续在界面上清楚表达。

## 5. 全量质量门禁

2026-07-27 最终执行 `npm run ci:check`：

- Vue 类型检查与 Vite 生产构建通过；
- 主题、格式、A5 桌面证据、工作簿和 XLSX 发布契约通过；
- Rust 功能测试 `294/294` 通过，性能测试 `1/1` 通过；
- Rust 复杂工作簿性能测试 `1/1` 通过；
- 100 MiB PDF 范围读取只请求约 `255.9 KiB`，本轮本机约 `54 ms`；
- 生产依赖审计 `0` 个漏洞。

现存非阻断项仍是 Vite 的少量大分包警告。它属于后续性能优化，不影响本阶段正确性结论。

## 6. A5 退出判定

阶段 A 的桌面级退出条件已满足：

- 核心格式在真实 Tauri 进程中完成保存/重开，而非浏览器模拟；
- 敏感、冲突、非法结构、大文件、日志轮转和进程重启均有自动化证据；
- 桌面证据已进入 `ci:check`，以后缺失或删减检查会直接失败；
- fixture、WebView 配置和知识库完全隔离；
- 功能代码、测试证据和审计文档可按提交独立回溯。

安装包、文件关联、升级/卸载和多机器矩阵转入发布专项，不阻塞“统一文件管理阶段 A”收口。

## 7. 下一阶段开发顺序

### 已收口的 G8：知识图谱产品化与存在感

该主线已完成当前存在感收口，直接回应“知识图谱能力弱、使用时感知不到”的核心反馈。

1. **G8-1 默认工作台关系摘要（已完成）**：最近文件、当前文件和搜索结果直接展示关联数量、关系类型、孤立风险和一键进入局部图谱。
2. **G8-2A 文件关系上下文基础（已完成）**：共享侧栏已覆盖各文件工作面，提供方向、分类、对象定位、原文证据和未提取状态。
3. **G8-2B 上下文补全与性能收口（已完成）**：同标签/同集合上下文、有界缓存及 PDF/Table/Canvas 真实桌面定位证据均已交付。
4. **G8-3～G8-5（转增强队列）**：搜索关系解释、代码/配置关系提取和图谱—思维导图协同继续保留，但不再阻塞原始专业格式目标。

退出条件：用户不进入独立图谱页，也能在默认工作台、搜索和文件工作面看到并使用关系；图谱从“单独的可视化功能”变成跨格式管理导航层。

### 当前专业格式主线

1. **PDF B0（已完成）**：页面旋转、排序、排除的内存草稿、撤销/重做和离开保护；
2. **PDF B1A（已完成）**：写入引擎/许可证审计、风险阻断和签名保护的内存隔离副本复读验证；
3. **PDF B1B（已完成）**：只新建、原子无覆盖写入、落盘复读和 PDF.js 重开；
4. **PDF B1C（已完成）**：复杂生产者、页面继承、扫描页和高风险阻断兼容矩阵；
5. **DOCX C1-2B（已收口）**：右侧只读工作面、目录、文内/全局搜索、样式/编号、内部媒体、附属内容、合并表格、分页和节版式已交付；下一步建立三类真实生产者 fixture；
6. WPS `.wps/.et/.dps` 先做规范、许可与转换保真审计，无法证明可靠时只提供外部打开或受控副本转换；
7. 统一批处理、元数据、工作区健康和发布矩阵。

权威执行顺序和能力事实见 `docs/B1C_PDF_Compatibility_Closure_Audit_2026-07-27.md`。

## 8. 关键提交

- `f5e610e fix: reload disk content after text conflicts`
- `14ac45c test: add real Tauri A5 desktop audit`
- `bd3e2b1 test: close A5 desktop safety scenarios`
- `a3dd964 test: cover A5 structured desktop formats`

用户本地 `.claude/settings.local.json` 未暂存、未提交。
