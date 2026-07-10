# Long编辑 产品审计与增强路线图

> 日期：2026-07-10  
> 范围：基于当前仓库代码审计、构建验证、依赖安全检查，以及对 Obsidian、Logseq、SiYuan、Typora、Joplin、Zettlr、MarkText、Notion 等产品的公开资料对标。

## 1. 当前项目判断

Long编辑目前已经不是单纯 Markdown 编辑器，而是一个本地优先的桌面知识库应用。核心能力包括：

- Vue 3 + Vite + Tauri 2 桌面架构。
- 文件库管理、标签页、多模式 Vditor 编辑。
- WikiLink、反向链接、标签搜索、知识图谱。
- 历史快照、最近文件、收藏文件、每日笔记、模板入口。
- Git 初始化、提交、推送、拉取。
- AI 文本处理，支持 OpenAI 兼容接口。
- Windows 托盘、开机自启、`.md` 默认打开关联。

项目的差异化基础是清楚的：本地 Markdown 文件、桌面系统集成、轻量知识网络、AI 写作辅助。下一阶段的产品主线建议调整为“精致外观与优雅动效优先”：先把打开应用、切换文件、写作、预览、搜索、设置这些高频体验做到扁平、优雅、华丽且克制，再逐步补齐知识组织、AI、同步与发布能力。

这不是表面美化。对桌面写作软件来说，视觉质感会直接影响用户是否愿意长时间停留，是否愿意把它当作主力工具。Long编辑应该先形成一个鲜明印象：轻、稳、细腻、有呼吸感，像一个认真打磨过的本地知识工作台。

## 2. 本次审计发现

### 2.1 验证结果

- `npm.cmd run build` 通过。
- `cargo check` 通过。
- `cargo test` 通过，但当前实际运行 `0 tests`。
- `npm audit --registry=https://registry.npmjs.org --omit=dev` 发现 5 个依赖漏洞。
- 当前工作区已有未提交变更：`.claude/settings.local.json`、`src-tauri/Cargo.lock`。

### 2.2 高优先级风险

| 风险 | 位置 | 影响 | 建议 |
| --- | --- | --- | --- |
| CSP 关闭 | `src-tauri/tauri.conf.json` 的 `csp: null` | Markdown 渲染、AI 输出、HTML 导出等场景一旦出现注入问题，Tauri 命令面会被放大 | 制定最小 CSP，禁止不必要的远程脚本与内联脚本 |
| 文件系统权限偏宽 | `src-tauri/capabilities/default.json` 中 `fs:allow-*` | 前端被注入时可能扩大为任意文件读写风险 | 尽量改为 scoped capability，后端命令二次校验路径 |
| 后端命令接受任意路径 | `read_markdown_file`、`write_markdown_file`、`delete_item`、`move_item`、`import_to_library` | 越权读写、误删、跨库操作风险 | 引入统一 `LibraryPathGuard`，所有命令先验证路径属于已配置库或明确外部文件 |
| AI API Key 明文保存 | `AppConfig.ai_api_key`、Pinia store | 配置文件泄露会暴露密钥 | 使用系统凭据库，或至少单独加密存储并在 UI 脱敏 |
| 自定义图片协议无库边界 | `misty-img://` 协议处理 | 可能被构造为读取任意本地图片或 SVG | 限定只服务当前库、历史缓存或临时导入目录，并禁止 SVG 脚本风险 |
| 缺少回归测试 | Rust 与前端均缺少有效测试 | 文件操作、历史快照、路径穿越、Git 集成修复容易回归 | 先补后端单元测试，再补关键前端交互测试 |

### 2.3 依赖安全

`npm audit` 报告：

- `lodash` / `lodash-es`：high。
- `picomatch`：high。
- `postcss`：moderate。
- `yaml`：moderate。

建议先执行 `npm audit fix --registry=https://registry.npmjs.org`，确认是否只更新 lockfile；如果牵涉大版本，再按依赖来源拆分升级。当前 `vue-router` 使用 `^5.0.3`，需要确认这是项目明确选择的版本线，还是误升到了非主流版本通道。

### 2.4 架构维护性

- `src-tauri/src/lib.rs` 约 1095 行，混合配置、文件、历史、图片协议、Git、AI、窗口托盘等职责。
- `src/views/LibraryMode.vue` 约 2027 行，承担文件树、编辑器、搜索、Git、AI、历史、拖拽等大量交互。

建议按领域拆分，而不是抽象化重构：

- Rust：`config.rs`、`files.rs`、`history.rs`、`git.rs`、`ai.rs`、`graph.rs`、`system.rs`。
- 前端：`LibraryShell.vue`、`FileTreePanel.vue`、`EditorWorkspace.vue`、`LinksPanel.vue`、`HistoryPanel.vue`、`GitStatusBar.vue`、`AiCommandDialog.vue`。

## 3. 竞品对标

### 3.1 Obsidian

公开定位是个人知识库与知识组织工具，强调链接、图谱、Canvas、插件生态、同步与发布。官方路线图还列出多人协作、Publish 支持 Bases/Canvas、PDF annotation、打开单个 Markdown 文件等方向。

对 Long编辑 的启发：

- 强化图谱不是只显示节点，而是让图谱能筛选、分组、解释关系。
- 引入属性数据库视图，让 Markdown 文件可按状态、标签、时间、项目维度组织。
- 插件生态可以晚做，但命令体系和扩展点要提前设计。

### 3.2 Logseq

Logseq 强在本地优先、块级大纲、双链、任务、PDF 标注、白板、闪卡和查询。它的优势不是“写文档漂亮”，而是把信息拆成可引用、可查询、可复用的块。

对 Long编辑 的启发：

- 可以保持 Markdown 文件级模型，但新增“块锚点”和标题级引用，形成轻量块引用。
- 每日笔记、任务、标签和反链可以合并成一个 Inbox/Journal 工作流。
- 查询语法不必一步到位，可先做保存搜索和智能筛选。

### 3.3 SiYuan

SiYuan 的核心卖点是隐私优先、完全离线、端到端加密同步、块级引用和双向链接。它给本地知识库产品树了一个安全与数据主权标杆。

对 Long编辑 的启发：

- “本地优先”要升级为“数据可信”：安全存储、备份、可恢复、可迁移。
- AI Key、同步凭据、历史缓存应纳入隐私威胁模型。
- 后续若做同步，应优先考虑端到端加密和用户自托管路径。

### 3.4 Typora / MarkText

Typora 与 MarkText 的价值集中在写作体验：单窗沉浸、所见即所得、专注模式、打字机模式、字数统计、图片粘贴、PDF/HTML/DOCX/ePub 等导出。

对 Long编辑 的启发：

- Long编辑已有知识库优势，但单篇文章的写作完成度还可以提升。
- 导出链路应从 HTML/PDF 扩展到 DOCX/ePub/Pandoc。
- 图片、表格、数学公式、Mermaid、代码块的编辑体验要做成“写作者不用想格式”。

### 3.5 Joplin

Joplin 强调跨平台同步、Web Clipper、端到端加密、插件和 Markdown 笔记。它证明了本地 Markdown 与云同步、浏览器采集并不冲突。

对 Long编辑 的启发：

- Web Clipper 或“剪藏到当前库”是高价值入口。
- 同步不一定先自研云服务，可以优先支持 Git、WebDAV、文件夹同步、自托管。
- 加密备份与恢复体验会成为长期信任资产。

### 3.6 Zettlr

Zettlr 面向长文和学术写作，重点是引用、Zotero/Better BibTeX、Pandoc 导出、项目写作。

对 Long编辑 的启发：

- 可以用“研究/长文模式”切入专业人群。
- 增加 Citation Key 自动补全、参考文献区块、Pandoc 导出配置。
- Git + Markdown + 引用管理是技术文档、论文、课程笔记用户的强组合。

### 3.7 Notion

Notion 的强项是数据库、团队知识库、项目视图、AI 搜索和协作。Long编辑不应直接复制云端协作，但可以借鉴它的“文档即数据库”和“多视图组织”。

对 Long编辑 的启发：

- Front Matter 属性可以驱动表格、看板、日历、时间线。
- AI 不只用于润色，还可以做库内问答、相关笔记推荐、自动标签。
- 团队功能可暂缓，但导出、发布、分享链接可以先做个人版。

## 4. 产品增强方向

### 4.0 视觉与动效优先战略

目标：先把 Long编辑 做成同类产品里最有质感的本地 Markdown 知识库。风格关键词是：扁平、优雅、精致、华丽、克制。

设计原则：

- 少用重阴影、厚玻璃、强渐变，改用细边线、柔和层级、清晰留白、稳定节奏。
- 华丽来自细节密度，而不是装饰堆叠：状态变化、过渡节奏、悬浮反馈、图标一致性、排版比例都要统一。
- 动效只服务认知：告诉用户“从哪里来、到哪里去、当前发生了什么”，避免无意义弹跳和大幅位移。
- 编辑区永远优先：所有侧栏、工具栏、弹窗都应衬托写作，不抢文章主体。
- 每个主题都要有独立性：避免只是换主色，应该在边框、底色、强调色、控件质感、编辑器背景上形成完整组合。

优先打磨的界面：

1. 启动与主界面第一屏：窗口出现、侧栏加载、编辑区空状态、品牌标题和当前库状态。
2. 文件树与侧栏：折叠、展开、选中、拖拽、右键菜单、最近文件、收藏文件。
3. 编辑器表面：工具栏、状态栏、标题/代码/引用/表格/图片样式、光标所在段落反馈。
4. 命令面板：搜索输入、结果分组、键盘选择、高亮匹配、空状态。
5. 设置页：从“表单集合”升级为清晰的信息架构和可预览配置中心。
6. 图谱页：节点、边、悬浮卡片、缩放反馈、筛选控件。

视觉系统落地项：

- 建立设计 token：颜色、字号、间距、圆角、边框、阴影、动效曲线、动效时长。
- 建立主题矩阵：明亮、暗色、柔和、玻璃、极简、锐利等风格都映射到 token，而不是散落 CSS。
- 建立动效规范：进入 160-220ms，退出 120-180ms，布局切换 220-320ms，统一 cubic-bezier。
- 建立组件状态表：default、hover、active、focus、disabled、dragging、dirty、selected、loading。
- 建立空状态语言：没有库、没有文件、没有标签、没有历史、没有搜索结果时都要精致但不啰嗦。
- 建立截图验收：桌面 1000x700、1366x768、1920x1080，以及窄宽度侧栏场景。

建议先做一轮“视觉冻结版”：

- 不新增大功能。
- 不大拆业务逻辑。
- 专注统一 CSS token、主题、过渡、空状态、图标和布局比例。
- 每改一个界面都截图对比，直到形成稳定审美语言。

### 4.1 先把“可信本地知识库”做稳

目标：用户敢把长期知识资产放进 Long编辑。

P0：

- 路径边界统一校验：所有文件命令只能操作已配置库、用户明确选择的外部文件、应用缓存目录。
- CSP 与 Markdown 渲染安全：关闭危险 HTML 默认执行路径，补充 XSS 回归用例。
- AI Key 安全存储：系统凭据库优先，配置文件只保留 provider、endpoint、model。
- 历史快照可恢复：增加“恢复前自动备份当前版本”，避免误覆盖。
- 依赖漏洞修复：处理 lodash、picomatch、postcss、yaml。

P1：

- 库级健康检查：扫描损坏链接、丢失图片、重复文件名、孤立附件、异常大文件。
- 数据备份向导：导出 zip、增量备份、备份位置提醒。
- 文件操作回收站：删除先进入库内 `.trash` 或系统回收站。

### 4.2 强化知识组织，不只做文件树

目标：从“能编辑 Markdown”升级为“能管理知识关系”。

P0：

- Front Matter 标准化：支持 `title`、`tags`、`status`、`created`、`updated`、`aliases`、`project`。
- 属性侧栏：打开文件时可视化编辑元数据。
- 保存搜索：把常用搜索保存成视图。
- 标签改进：区分正文 inline tag 与 Front Matter tag，统一索引。

P1：

- 数据库视图：基于 Front Matter 生成表格视图。
- 看板视图：按 `status` 或自定义字段分组。
- 日历视图：按 `created`、`updated`、`date` 或每日笔记聚合。
- 图谱过滤：按标签、目录、时间、状态过滤节点。

P2：

- 块引用：为标题、列表项或段落生成稳定锚点。
- 关系解释：图谱边点击后显示“在哪一行引用、上下文是什么”。
- 查询语言：先做简单语法，例如 `tag:rust status:draft updated:7d`。

### 4.3 写作体验向 Typora/MarkText 靠拢

目标：单篇文章从创建、编辑、插图、排版到导出都顺手。

P0：

- 导出增强：引入 Pandoc 检测，支持 DOCX、ePub、LaTeX、ODT。
- 图片体验：粘贴、拖拽、重命名、压缩、移动文件时自动维护链接。
- 文档统计：中文字符、英文单词、阅读时间、标题/段落/代码块统计。
- 表格编辑：提供可视化增删行列、对齐、格式化。

P1：

- 长文模式：章节导航、拆分预览、草稿状态、目标字数。
- 专注写作：更克制的 Zen 模式、当前段落高亮、打字机滚动。
- 导出模板：PDF/HTML/DOCX 样式模板可管理。

### 4.4 AI 从“文本处理”升级为“知识助手”

目标：AI 不只润色选中文本，而能理解当前库。

P0：

- AI 操作可审计：每次替换前显示 diff，支持插入为新块或复制结果。
- 提示词模板：润色、总结、翻译、标题生成、会议纪要、技术文档重写。
- 敏感信息提醒：发送到远程模型前提示包含 API Key、邮箱、手机号等风险。

P1：

- 库内问答：基于本地索引检索相关 Markdown，再发送最小上下文给模型。
- 自动标签/摘要：保存时可选生成 Front Matter 摘要和标签。
- 相关笔记推荐：根据当前文档内容推荐已有笔记。

P2：

- 本地模型优先模式：Ollama 配置检测、模型状态检查、离线问答。
- AI 任务队列：批量总结、批量补标签、批量生成标题。

### 4.5 同步、发布与采集

目标：形成输入、整理、输出闭环。

P0：

- Git 同步安全化：提交前展示变更摘要，失败时给出可恢复路径。
- Git 冲突处理：检测 rebase/pull 冲突，并提供冲突文件列表。

P1：

- Web Clipper：浏览器扩展或本地 HTTP 接口，支持保存网页正文、链接、截图到当前库。
- 发布为静态站点：将选定库/目录导出为静态 HTML 知识库。
- 分享包：把 Markdown、附件、样式打成 zip。

P2：

- WebDAV/文件夹同步。
- 端到端加密备份。
- 移动端或轻量 Web 只读端。

## 5. 推荐路线图

### 阶段 A：视觉系统与动效基线，1-2 周

交付目标：先形成 Long编辑 的高级感，让现有功能看起来、动起来、用起来都像一个统一产品。

- 梳理全局 CSS token：颜色、间距、字号、圆角、边线、阴影、动效曲线。
- 统一 6 套视觉风格的 token 映射，避免每套主题只是换颜色。
- 重做主界面第一屏：侧栏、编辑区、状态栏、空状态、窗口控制区。
- 重做侧栏交互：文件树选中、悬浮、拖拽、收藏、最近文件、Git 状态。
- 重做命令面板：搜索框、结果列表、匹配高亮、键盘态、空状态。
- 重做设置页视觉：分区、表单密度、预览区、危险操作区。
- 统一动效：路由切换、面板切换、弹窗进入退出、列表项出现、拖拽反馈。
- 做截图验收清单，至少覆盖 1000x700、1366x768、1920x1080。

验收标准：

- 所有主流程界面有统一的视觉层级和动效节奏。
- 任一主题下文字可读、状态明显、控件不跳动、不重叠。
- 高频交互的反馈足够细腻：点击、悬浮、选中、拖拽、保存、加载。
- `npm.cmd run build` 通过。

### 阶段 B：安全与稳定基线，1-2 周

交付目标：在视觉升级后补齐可信使用的底座。

- 修复 npm audit 漏洞。
- 引入路径校验模块和测试。
- 设置最小 CSP。
- AI Key 改安全存储。
- 文件删除改回收站或二次备份。
- Rust 增加 20 个左右单元测试，覆盖路径穿越、删除、移动、历史版本、图片保存。

验收标准：

- 构建、`cargo check`、`cargo test` 全通过。
- 路径穿越用例全部失败返回。
- 常规库内文件操作不受影响。

### 阶段 C：知识组织升级，2-4 周

交付目标：对标 Obsidian/Notion 的轻量属性视图。

- Front Matter 解析与写回。
- 属性侧栏。
- 标签索引统一。
- 保存搜索。
- 表格数据库视图 MVP。
- 图谱过滤和边上下文。

验收标准：

- 1000 个 Markdown 文件内索引不卡顿。
- 属性编辑不破坏正文。
- 搜索视图可持久化并恢复。

### 阶段 D：写作与导出升级，2-3 周

交付目标：对标 Typora/MarkText/Zettlr 的写作完成度。

- Pandoc 导出集成。
- 导出模板管理。
- 图片资产管理面板。
- 表格编辑增强。
- 长文模式和统计面板。

验收标准：

- 同一文档可导出 HTML、PDF、DOCX、ePub。
- 图片链接在移动/重命名后保持可用。
- 大文档编辑无明显输入卡顿。

### 阶段 E：AI 知识助手，3-5 周

交付目标：从文本工具变成库内助手。

- AI diff 预览。
- 提示词模板。
- 本地索引检索。
- 当前库问答 MVP。
- 自动摘要与标签。

验收标准：

- AI 操作不会静默覆盖原文。
- 用户可以看到发送给模型的大致上下文范围。
- 库内问答能返回引用来源。

## 6. 近期可直接开工的任务清单

1. 建立 `src/styles/tokens.scss`，集中定义颜色、字号、间距、圆角、边框、阴影、动效。
2. 建立 `src/styles/motion.scss`，统一 transition duration、easing、route/panel/list 动效类。
3. 扫描并替换分散在 `App.vue`、`LibraryMode.vue`、`SettingsView.vue` 中的硬编码视觉值。
4. 重做主界面空状态和当前库入口，让第一屏更像正式产品。
5. 重做文件树 item 状态：hover、selected、dirty、dragging、drop-target、context-menu。
6. 重做命令面板视觉和动效，作为“精致感样板组件”。
7. 重做设置页视觉密度和主题预览，让风格切换有真实可感差异。
8. 增加 Playwright 截图检查，覆盖主界面、设置页、命令面板、图谱页。
9. 随后新建 Rust 路径守卫模块，统一校验库内路径。
10. 执行 `npm audit fix` 并评估 lockfile diff。

## 7. 参考资料

- [Obsidian 官网](https://obsidian.md/)
- [Obsidian Roadmap](https://obsidian.md/roadmap/)
- [Logseq 官网](https://logseq.com/)
- [Logseq 文档](https://docs.logseq.com/)
- [SiYuan 官网](https://b3log.org/siyuan/)
- [Typora 官网](https://typora.io/)
- [Typora Export 文档](https://support.typora.io/Export/)
- [Joplin 官网](https://joplinapp.org/)
- [Zettlr Citations 文档](https://docs.zettlr.com/en/editor/citations/)
- [MarkText GitHub](https://github.com/marktext/marktext)
- [Notion 官网](https://www.notion.com/)
- [Notion Wiki 指南](https://www.notion.com/help/guides/category/wiki)
