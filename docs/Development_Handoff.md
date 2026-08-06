# Long Markdown Reader 开发交接

> **2026-08-04 最新接手入口：** v1.0.3 安装版真实多格式测试暴露了 ACL、更新策略、路由状态、工作区布局和跨格式编辑体验问题。后续开发以 [`User_Experience_Closure_Audit_2026-08-04.md`](./User_Experience_Closure_Audit_2026-08-04.md) 的 39 项验收清单和阶段 A-E 为最高优先级；下方历史阶段记录仅作为能力与证据背景，不得据此宣称当前用户体验已经收口。

> A0A 已完成安装态确认对话框 ACL 代码修复：主窗口补齐 confirm/message 权限，新增源码到能力清单的一致性检查并接入补丁发布门禁。A0A 完成时 UX-07、UX-11、UX-16 仍为开发中；当前状态以下方后续阶段和总验收清单为准。详见 [`A0A_Dialog_ACL_Hotfix_Audit_2026-08-04.md`](./A0A_Dialog_ACL_Hotfix_Audit_2026-08-04.md)。

> A0B 已完成更新体验与发布事实对齐：当前运行态不再自动请求未发布的 `latest.json`，设置页改为打开官方 GitHub Release 的手动更新入口，并同步修正共享发布策略与机器合同。UX-03 为待复测，下一安装包需验证外部浏览器打开行为。详见 [`A0B_Manual_Update_Experience_Audit_2026-08-04.md`](./A0B_Manual_Update_Experience_Audit_2026-08-04.md)。

> A0C 已完成设置子页返回与隐私诊断中文化：格式能力页现在识别设置来源，返回后重新定位格式能力项；隐私诊断入口、保存对话框及结果反馈已统一中文。UX-02、UX-04 为待复测。详见 [`A0C_Settings_Navigation_Localization_Audit_2026-08-04.md`](./A0C_Settings_Navigation_Localization_Audit_2026-08-04.md)。

> A0D 已完成设置页信息架构重构：八类任务导航替代单列长页，关系改善工具改为用户语言并折叠到知识能力高级区域，主题预设合并为可筛选、展示层去重的单一主题库。桌面 1366×768 与窄窗口 720×760 浏览器视觉复核通过；UX-01、UX-05、UX-06 为待安装包复测。详见 [`A0D_Settings_Information_Architecture_Audit_2026-08-04.md`](./A0D_Settings_Information_Architecture_Audit_2026-08-04.md)。

> A0E 已完成搜索与关联自动准备：首次选择资料库和缓存过期后由后台自动处理，用户状态、说明与更多菜单均改为任务语言；清除/隔离只作用于本机缓存并使用应用内确认框。UX-07 为待安装包复测。下一步按阶段 A 继续处理 UX-11 表格行删除交互与撤销。详见 [`A0E_Automatic_Search_Relation_Preparation_Audit_2026-08-04.md`](./A0E_Automatic_Search_Relation_Preparation_Audit_2026-08-04.md)。

> A0F 已完成 CSV/TSV/开放 Table 行交互止血：行号只选择，删除由明确命令和应用内确认触发；新增/删除行支持撤销重做，所有变更仅在点击保存后写入源文件。UX-11 为待安装包复测。下一步处理 UX-12，从图谱返回表格时等待资料库状态恢复并保持活动文件上下文。详见 [`A0F_Table_Row_Selection_Deletion_Undo_Audit_2026-08-04.md`](./A0F_Table_Row_Selection_Deletion_Undo_Audit_2026-08-04.md)。

> A0G 已完成资料库上下文与图谱返回修复：应用先恢复配置/标签再挂载路由，图谱返回和无路径资料库导航会补回活动文件；Table/Workbook 读取前等待配置，并以内存状态恢复滚动位置和 XLSX 活动 Sheet。UX-12 为待安装包复测。下一步处理 UX-19，保证 Markdown 首次打开和旧配置迁移后默认进入所见即所得。详见 [`A0G_Library_Context_and_Graph_Return_Audit_2026-08-04.md`](./A0G_Library_Context_and_Graph_Return_Audit_2026-08-04.md)。

> A0H 已完成 Markdown 默认模式迁移：新安装、旧配置和旧备份在没有用户显式选择标记时统一进入所见即所得；资料库与外部 Markdown 只在用户主动切换模式后持久化偏好。UX-19 为待安装包复测。下一步处理 UX-20，统一 Markdown 代码块、高亮文字、光标和选区的主题对比度。详见 [`A0H_Markdown_Wysiwyg_Default_Migration_Audit_2026-08-04.md`](./A0H_Markdown_Wysiwyg_Default_Migration_Audit_2026-08-04.md)。

> A0I 已完成 Markdown 代码主题对比度合同：九个应用主题统一代码块、语法色、光标和选区；资料库与外部 Markdown 的首次加载及实时主题切换共用兼容解析器。UX-20 为待安装包复测。下一步处理 UX-22，修复 TXT/LOG 编辑区被状态栏挤压的问题。详见 [`A0I_Markdown_Code_Theme_Contrast_Audit_2026-08-04.md`](./A0I_Markdown_Code_Theme_Contrast_Audit_2026-08-04.md)。

> A0J 已完成 TXT/LOG 工作区尺寸修复：具名 Grid 区域不再受标签栏显隐影响，正文稳定占据剩余高度，状态栏保持紧凑单行。UX-22 为待安装包复测。下一步处理 UX-23，修复窗口切换时外部修改误报。详见 [`A0J_Text_Workspace_Layout_Audit_2026-08-04.md`](./A0J_Text_Workspace_Layout_Audit_2026-08-04.md)。

> A0K 已完成外部修改检测重构：焦点恢复改用 Rust 内容摘要与精确文件身份，应用内保存采用写入回执更新基线；同一签名只提示一次，并提供比较、保留当前、重新加载。UX-23 为待安装包复测。下一步处理 UX-24/UX-27，统一代码编辑器主题与光标对比度。详见 [`A0K_External_Change_Identity_Audit_2026-08-04.md`](./A0K_External_Change_Identity_Audit_2026-08-04.md)。

> A0L 已完成 CodeMirror 主题合同：TXT/代码、JSON、YAML、XML、TOML 共用九主题语义配色，光标、选区、行号、搜索、括号、面板和提示层不再依赖默认值；自动门禁检查语法、行号和光标对比度。UX-24/UX-27 为待安装包复测。下一步处理 UX-25/UX-26/UX-28，收口 JSON Path 说明、大型树性能和结构化编辑器视觉。详见 [`A0L_CodeMirror_Theme_Contract_Audit_2026-08-04.md`](./A0L_CodeMirror_Theme_Contract_Audit_2026-08-04.md)。

> A0M 已完成 JSON 工作区收口：次要源码工具及结构诊断均可收起，字段路径改为用户任务语言并支持点击定位和明确复制反馈；大型树改用父子索引、按展开节点遍历和固定行高虚拟窗口，Rust 安全分析预算及点击保存写盘边界保持不变。UX-25/UX-26/UX-28 为待安装包复测。下一步处理 UX-29，为 LOG 建立专业查看与编辑双模式。详见 [`A0M_JSON_Workspace_Experience_Audit_2026-08-04.md`](./A0M_JSON_Workspace_Experience_Audit_2026-08-04.md)。

> A0N 已完成 LOG 专业工作区：查看模式继续使用范围读取、筛选、级别高亮、自动刷新和尾部跟随；8 MiB 以内可在明确确认影响后进入统一 CodeMirror 编辑器，支持撤销/重做且只有点击保存才写源文件。专用后端命令要求确认并以源签名拒绝并发覆盖，通用文本写入不能绕过。UX-29 为待安装包复测。下一步处理 UX-30，统一 HTML 与代码格式的专业编辑体验，并加入不执行危险脚本、不请求外部资源的安全网页预览。详见 [`A0N_Professional_Log_Viewer_Edit_Audit_2026-08-04.md`](./A0N_Professional_Log_Viewer_Edit_Audit_2026-08-04.md)。

> A0O 已完成 HTML/代码专业工作区：十类源码格式共用行号、语法高亮、括号匹配、自动缩进、有界关键字/标签/文档词补全和轻量诊断；HTML 默认源码，可切换到 DOM 净化、严格 CSP 与无权限 sandbox 三重隔离的安全预览。TextEditor 的历史自动保存已移除，编辑仅更新草稿，只有用户点击保存才以签名保护写盘。UX-30 为待安装包复测。下一步处理 UX-31，统一 YAML/XML/TOML 结构化源码工作区。详见 [`A0O_Code_and_Safe_HTML_Workspace_Audit_2026-08-04.md`](./A0O_Code_and_Safe_HTML_Workspace_Audit_2026-08-04.md)。

> A0P 已完成 YAML/XML/TOML 结构化源码工作区收口：侧栏使用面向任务的结构导航与问题语言，点击条目可定位源码；实时分析按源码规模自适应延迟，并串行追赶最新内容，避免连续编辑并发堆积。统一主题、响应式侧栏、Rust 诊断和显式保存边界保持不变。UX-31 为待安装包复测。下一步处理 UX-32，优化 XLSX 布局、冻结区域视觉和高级数据对象说明。详见 [`A0P_Structured_Source_Workspace_Audit_2026-08-04.md`](./A0P_Structured_Source_Workspace_Audit_2026-08-04.md)。

> A0Q 已完成 XLSX 工作区体验收口：默认占整行的高级对象摘要已移入“透视表与数据连接”工具栏入口，首层说明改为用户语言；主工具栏和 Sheet 标签更紧凑，入口在窄窗口保留可达。网格默认单元格、表头、行号与冻结区域改用不透明主题表面，冻结分隔保持清晰。UX-32 为待安装包复测。下一步处理 UX-33，推进 DOCX 页面式直接编辑与显式保存边界。详见 [`A0Q_Workbook_Workspace_Experience_Audit_2026-08-04.md`](./A0Q_Workbook_Workspace_Experience_Audit_2026-08-04.md)。

> A0R 已完成 UX-33A DOCX 直接保存基础：安全正文块可从页面点击定位并在内存草稿中即时预览；只有用户确认“保存到原文件”才会写盘。后端复核签名、源摘要和隔离输出，复用可靠替换并在落盘复读失败时恢复原字节；另存副本继续保留。UX-33 保持进行中，下一步 UX-33B 建设显式分页、多操作草稿与编辑工具栏。详见 [`A0R_DOCX_Direct_Source_Save_Audit_2026-08-04.md`](./A0R_DOCX_Direct_Source_Save_Audit_2026-08-04.md)。

> A0S 已完成 UX-33B DOCX 分页草稿工作面：显式/渲染分页符和节边界生成独立纸面，页面应用节宽高、方向和页边距；工具栏加入返回、撤销、重做、保存，未保存草稿离开时提供保存、放弃、继续编辑。当前仍是单目标可靠补丁，UX-33/UX-39 保持进行中。下一步 UX-33C 先证明批量补丁整体复读与回滚，再开放多目标草稿。详见 [`A0S_DOCX_Paged_Draft_Editing_Audit_2026-08-04.md`](./A0S_DOCX_Paged_Draft_Editing_Audit_2026-08-04.md)。

> A0T 已完成 UX-33C DOCX 批量补丁事务基础：2–32 个不同语义锚点按顺序通过单项门禁、最终语义复读和确定性整批重放；临时副本重开、源签名冲突、一次可靠覆盖及失败恢复均有三生产者回归。当前前端仍是单目标草稿，UX-33 保持进行中。下一步 UX-33D 接入多目标草稿、修改清单及整批验证/保存。详见 [`A0T_DOCX_Batch_Patch_Transaction_Audit_2026-08-04.md`](./A0T_DOCX_Batch_Patch_Transaction_Audit_2026-08-04.md)。

> A0U 已完成 UX-33D DOCX 多目标草稿工作面：跨页目标自动进入修改清单，语义锚点防止冲突操作，统一撤销/重做可恢复整份草稿；1 项沿用单项命令，2–32 项使用批量隔离验证与可靠覆盖保存。批量另存副本仍明确禁用，UX-33 保持进行中。下一步 UX-33E 补齐批量另存副本，再扩大安全对象覆盖并执行三生产者安装态复测。详见 [`A0U_DOCX_Multi_Target_Draft_Workspace_Audit_2026-08-04.md`](./A0U_DOCX_Multi_Target_Draft_Workspace_Audit_2026-08-04.md)。

> A0V 已完成 UX-33E DOCX 批量可靠另存副本：2–32 项草稿可写入不存在的新 DOCX，命令复核源签名与隔离摘要、确定性重放、目标落盘字节、结构/语义复读和源文件不变；失败时清理未验收副本，已有目标始终拒绝覆盖。Word/WPS/LibreOffice 三类 fixture 回归通过。UX-33 保持进行中，下一步 UX-33F 审计并扩大安全对象覆盖，随后进入安装态复测。详见 [`A0V_DOCX_Batch_Reliable_Copy_Save_Audit_2026-08-04.md`](./A0V_DOCX_Batch_Reliable_Copy_Save_Audit_2026-08-04.md)。

> A0W 已完成 UX-33F DOCX 安全字符格式扩展：单运行目标在粗体、斜体、下划线之外支持直接 RGB 字色和 8–72 磅字号，页面即时显示草稿效果，并完整接入撤销/重做、批量验证、覆盖及另存事务。主题色、字体族和跨部件对象继续只读；Word fixture 语义往返通过，WPS/LibreOffice fixture 因没有白名单单运行目标而保持只读。UX-33 保持进行中，下一步 UX-33G 审计正文内超链接标签等单部件候选，再进入安装态复测。详见 [`A0W_DOCX_Direct_Color_Font_Size_Audit_2026-08-04.md`](./A0W_DOCX_Direct_Color_Font_Size_Audit_2026-08-04.md)。

> A0X 已完成 UX-33G DOCX 简单超链接显示文字编辑：仅开放单段落、单链接、单运行、单文本节点且具有目标的白名单结构，界面明确提示地址保持不变；补丁只替换文本字节，语义复读核对链接载体，链接外壳、目标属性和其余部件保持不变。三生产者自动证据来自真实 fixture 的确定性派生链接包，不等同于原生超链接生产者证据。UX-33 保持进行中，下一步 UX-33H 收集原生样本并执行安装态复测。详见 [`A0X_DOCX_Hyperlink_Label_Edit_Audit_2026-08-04.md`](./A0X_DOCX_Hyperlink_Label_Edit_Audit_2026-08-04.md)。

> A0Y 已完成 UX-33H DOCX 原生超链接生产者审计：Word 与 LibreOffice 原生 `<w:hyperlink>` 各有 2 个简单标签可编辑、2 个复杂标签只读；WPS 原生输出 4 个 `HYPERLINK` 字段，全部按字段门禁只读。三款生产者均完成创建、保存、退出和新实例重开，fixture 摘要、机器合同及逐字节补丁回归已接入。UX-33 保持进行中，下一步 UX-33I 使用包含新代码的 LongEdit 桌面构建执行安装态/WebView 复测。详见 [`A0Y_DOCX_Native_Hyperlink_Producer_Audit_2026-08-04.md`](./A0Y_DOCX_Native_Hyperlink_Producer_Audit_2026-08-04.md)。

> A0Z 已完成 UX-33I DOCX 原生超链接桌面 WebView 审计：真实 Tauri Debug WebView2 中，Word/LibreOffice 各 2 个“链接文字”目标通过草稿、撤销/重做、隔离验证和保存边界检查；WPS 字段链接为 0 个编辑目标并保持只读。5 张截图及机器清单通过，三份源 fixture 和隔离副本字节未变。本步不是 MSI/NSIS 安装生命周期证据，UX-33 保持进行中；下一步 UX-33J 在可丢弃环境复测无签名内部安装包，不覆盖当前用户安装。详见 [`A0Z_DOCX_Hyperlink_Desktop_Audit_2026-08-04.md`](./A0Z_DOCX_Hyperlink_Desktop_Audit_2026-08-04.md)。

> A10 已完成 UX-33J 安装态执行器准备：GitHub 一次性 Windows 流水线已从冻结产品提交动态读取版本，不再锁死 `1.0.0`；安装后 WebView 烟测已接入 Word/WPS/LibreOffice 原生超链接 fixture、草稿撤销/重做、隔离验证、只读降级、安装器摘要和隐私净化路由。当前只证明 harness 就绪，尚未产生 `1.0.3` 的真实安装结论。下一步推送后以该提交触发 hosted lifecycle，回收证据再关闭 UX-33J。详见 [`A10_DOCX_Installed_Harness_Audit_2026-08-04.md`](./A10_DOCX_Installed_Harness_Audit_2026-08-04.md)。

> UX-33J 首次 hosted run `30897488050` 已构建 `22ac691` 的 `1.0.3` 无签名 NSIS，但旧 R5J 启动 hash 假设在 DOCX 检查前超时；不是 DOCX 功能失败。执行器现改为显式导航工作台。下一次运行复用 `30897488050` 安装器时，`product_ref` 必须保持 `22ac691`，以维持安装器源码绑定。

更新日期：2026-08-04
交接基线：当前发布版本 `v1.0.3`；日常管理、文本/开发格式、PDF 研究与页面管理、图表、Canvas/OPML 思维导图、知识图谱和现代 Office 基础工作面已经形成主干。当前仍为无 Authenticode 签名社区版，原自动更新私钥不可用，v1.0.3 不发布 `latest.json` 或 `.sig`，版本更新暂时通过 GitHub Release 手动下载安装。

> 最新接手入口：[`Current_Closure_Status_and_Packaging_Plan_2026-07-31.md`](./Current_Closure_Status_and_Packaging_Plan_2026-07-31.md)。当前先执行 E5 高级能力最终收口审计，随后构建并验证未签名 MSI/NSIS；真实签名、Windows 10/11 隔离发布矩阵与人工批准继续独立阻塞正式 RC，`releaseCandidate=false`。

> 2026-07-31 C1A 已完成：R5N 外部签名环境仍阻断时，知识图谱产品化继续向管理行动推进。现有关系新增/删除、来源证据和健康治理保持不变；图谱节点现在可按 1～4 层局部关系生成新的 Markdown 项目笔记，记录中心来源、关联资料、目标和任务，并自动进入现有搜索与首页待办。生成文件与中心对象同目录、同名递增且不覆盖，最多写入 100 个关联对象。下一本机阶段为 C1B 子图智能集合；P0 仍是 R5N 已签名 Windows 10/11 外部发布执行。详见 [`C1A_Graph_Project_Note_Audit_2026-07-31.md`](./C1A_Graph_Project_Note_Audit_2026-07-31.md)。

> 2026-07-31 C1B 已完成：Markdown/PDF 图谱中心可按 1～4 层保存为动态智能集合；集合使用知识库相对根路径，每次打开实时重建文件级子图，并已接入首页、Library 集合侧栏和文件关系上下文。管理备份可保留并在换机映射后恢复图谱集合。当前没有真实签名证书，R5N 保持 `releaseCandidate=false` 并转为未来外部执行项，不再阻塞本机产品收尾。下一本机阶段为 C1C 关系确认/隐藏/恢复，随后进入 D1 统一体验审计。详见 [`C1B_Dynamic_Graph_Collections_Audit_2026-07-31.md`](./C1B_Dynamic_Graph_Collections_Audit_2026-07-31.md)。

> 2026-07-31 C1C 已完成：共同标签推断关系可在文件关系上下文中确认、隐藏、改回推断和恢复；判断以知识库相对路径保存到 `.longedit/graph-relation-decisions.json`，不修改 Markdown。已确认关系会进入图谱和动态集合，并从孤立文件治理中移除；隐藏后影响立即撤销。显式链接与结构关系继续以原文件为事实源。C 阶段本机产品化主线已收口，下一步进入 D1 跨编辑器统一体验审计与集中修正。详见 [`C1C_Graph_Relation_Lifecycle_Audit_2026-07-31.md`](./C1C_Graph_Relation_Lifecycle_Audit_2026-07-31.md)。

> 2026-07-31 D1A 已完成：跨编辑器矩阵已建立，首批关闭 YAML/XML/TOML 的体验缺口。三个结构化源码编辑器共用响应式结构面板，桌面可收起，760px 以下默认保留完整源码空间并可一键切换结构/诊断；保存按钮统一为“保存中/保存/已保存”，状态支持辅助技术播报。安全保存和格式能力边界未改变。下一步进入 D1B，集中处理 JSON、Table、Diagram、Canvas、Workbook、PDF、DOCX、PPTX 的工具栏密度、只读/阻断提示和窄屏优先级。详见 [`D1A_Structured_Editor_Unified_Experience_Audit_2026-07-31.md`](./D1A_Structured_Editor_Unified_Experience_Audit_2026-07-31.md)。

> 2026-07-31 D1B 已完成：JSON、Table、Diagram、Canvas、Workbook 的保存入口统一为“保存中/保存/已保存”，动态状态支持辅助技术播报；PDF、DOCX、PPTX 的 sidecar、隔离验证、可靠副本、只读与阻断结果统一采用 status/alert 语义。Table 与 Diagram 在 620px 以下保持标题、核心模式和保存入口可用，Canvas 窄屏状态不再挤压工具栏。格式写入白名单和安全边界均未扩大。下一步进入 D1C 键盘焦点与关键流程可访问性收口，随后执行 D2 跨格式安全降级回归。详见 [`D1B_Complex_Workspace_Consistency_Audit_2026-07-31.md`](./D1B_Complex_Workspace_Consistency_Audit_2026-07-31.md)。

> 2026-07-31 D1C 已完成：JSON、Table、Diagram、Canvas、Workbook、PDF、DOCX、PPTX 的高频模式切换、图标按钮和关键弹层已完成键盘与控件语义收口。Table 视图删除改为独立可聚焦按钮；PDF 翻页、颜色和侧栏标签有稳定名称/状态；PPTX 放映层可接管并约束焦点，Esc/方向键/空格不重复触发，退出后返回放映按钮。新增 `check:d1c-accessibility-contract` 并接入总格式门禁。D1 统一体验阶段至此收口，但不宣称完整 WCAG 认证。下一步进入 D2 跨格式安全降级回归。详见 [`D1C_Keyboard_Focus_and_Accessibility_Audit_2026-07-31.md`](./D1C_Keyboard_Focus_and_Accessibility_Audit_2026-07-31.md)。

> 2026-07-31 D2 已完成：39 类注册格式全部且仅一次归入 6 条安全通道，统一覆盖签名保护覆盖、严格只读、PDF sidecar、Office 可靠新副本、外部应用交接和 XLSX 有界写回。新增 `shared/safe-degradation-contract.json` 与 `check:d2-safe-degradation-contract`，会核对格式注册表、发布矩阵、writer 边界以及冲突/失败/恢复实现证据，并已接入总格式门禁。本机 C、D1、D2 产品收尾主线至此完成，下一步为 D3 最终产品验收与能力冻结；R5N 正式签名和剩余外部生产者证据仍独立保持 fail-closed。详见 [`D2_Cross_Format_Safe_Degradation_Audit_2026-07-31.md`](./D2_Cross_Format_Safe_Degradation_Audit_2026-07-31.md)。

> 2026-07-31 D3 已完成：日常工作区、格式编辑与降级、知识组织、可视化/主题/可访问性、PDF、现代 Office 副本、XLSX 有界编辑、恢复隐私和性能回归共 9 个领域已汇总为 `shared/product-acceptance-freeze.json`。`check:d3-product-acceptance-freeze` 会验证 39 格式、10 发布配置、6 安全通道、真实证据文件及所有验收门禁从 `ci:check` 可达。基础产品状态为 `accepted-for-capability-freeze`，但 `releaseCandidate=false`；签名与外部生产者证据继续独立阻断。下一代码阶段为 E0，先审计完整 Excel 等价编辑、新格式编辑器和主题扩展的缺口、风险与优先级。详见 [`D3_Final_Product_Acceptance_and_Capability_Freeze_Audit_2026-07-31.md`](./D3_Final_Product_Acceptance_and_Capability_Freeze_Audit_2026-07-31.md)。

> 2026-07-31 E0 已完成：`shared/advanced-capability-roadmap.json` 已把高级开发拆为 Excel 等价 P0、新格式编辑器 P1、按场景主题扩展 P2、复杂 Office/WPS P2 四条轨道。Excel 当前 10 个公式族已验证，但数组生产者仍为 1/3、Multi-axis Pivot 为 2/3；下一代码阶段为 E1A 动态数组/spill 只读内存计算与预览，明确不写用户文件、不改公式缓存。SVG 为后续 E2A 候选，安全合同通过前不注册 writer。主题当前 3 核心 + 4 场景承诺已完成，后续不以数量代替场景证据。`releaseCandidate=false` 保持不变。详见 [`E0_Advanced_Editing_Gap_and_Priority_Audit_2026-07-31.md`](./E0_Advanced_Editing_Gap_and_Priority_Audit_2026-07-31.md)。

> 2026-07-31 E1A 已完成：`dynamicArrayPreviewContract` 已开放受限 `SEQUENCE` 动态数组内存预览，支持有限数字参数、直接 A1 数值依赖和未保存数值草稿，单次上限 10,000 个单元格；占用、外来公式、合并区域、越界、未知函数和复杂依赖均稳定阻断。该命令只读且受源签名保护，不写用户文件、公式缓存或数组声明。数组生产者 1/3 与 Multi-axis Pivot 2/3 状态不变，E1B/E1C 继续等待外部证据；下一代码阶段为 E2A SVG 安全合同与基础源码编辑器。详见 [`E1A_Dynamic_Array_In_Memory_Preview_Audit_2026-07-31.md`](./E1A_Dynamic_Array_In_Memory_Preview_Audit_2026-07-31.md)。

> 2026-07-30 权威入口：R1 统一发布能力矩阵与 R2 Windows 安装生命周期已完成。当前 MSI/NSIS 身份、Markdown 关联白名单、系统默认应用选择、旧标识迁移和卸载数据边界均有机器契约与真实桌面证据；实现提交 `032ec11` 的 [GitHub Quality Gate](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30533681730) 已完整通过。`releaseCandidate=false`，下一代码阶段为 R3 索引恢复、备份导入导出与隐私净化诊断包；E1B WPS ODT 2/3 和 X3-B6 数组生产者 1/3 继续作为外部证据门禁。证据见 [`R2_Windows_Install_and_Lifecycle_Audit_2026-07-30.md`](./R2_Windows_Install_and_Lifecycle_Audit_2026-07-30.md)。

> 2026-07-30 R3A 已完成：知识索引状态新增 `recoveryAvailable` 和 `staleSourceCount`；损坏 `snapshot.json` 可在原缓存目录隔离为 `snapshot.corrupt.<timestamp>.json`，随后用户可显式重建索引。该步骤不读取、不导出、不打包知识库正文。当前距离“全格式支持和收口”还剩 R3B 备份导出、R3C 备份导入恢复、R3D 隐私诊断包、R4 正式签名/Windows VM 发布矩阵，以及外部证据门禁 E1B WPS ODT 3/3 和 X3-B6 数组生产者 3/3。下一代码阶段为 R3B，详见 [`R3A_Knowledge_Index_Recovery_Audit_2026-07-30.md`](./R3A_Knowledge_Index_Recovery_Audit_2026-07-30.md)。

> 2026-07-30 R3B 已完成：设置页新增管理备份导出，生成固定 ZIP：`manifest.json`、`config.redacted.json` 和三份能力/韧性合同。备份只包含脱敏配置、库清单摘要、路径/remote 指纹、保存搜索和能力合同；不包含文档正文、API Key、系统凭据、完整用户路径或缓存正文。当前剩余收口阶段为 R3C 备份导入恢复、R3D 隐私诊断包、R4 正式签名/Windows VM 发布矩阵，以及 E1B/X3-B6 两个外部证据门禁。下一代码阶段为 R3C，详见 [`R3B_Management_Backup_Export_Audit_2026-07-30.md`](./R3B_Management_Backup_Export_Audit_2026-07-30.md)。

> 最新基础桌面门禁基线为 36 项真实 Tauri 检查和 28 张截图；PPTX C3 结构化只读、三生产者输入、搜索定位、知识关系、索引生命周期和桌面视觉矩阵均已收口；C4D 已完成可靠新副本，C4E 已完成 PowerPoint/WPS/LibreOffice 对文本、样式、替代文本三个输出的真实复开。下文较早的逐批记录保留为历史证据，不应覆盖最新结论。

> 2026-07-28 审计及下文逐批记录保留为历史证据；当“下一步”描述冲突时，以本文件顶部链接的 2026-07-30 综合审计为准。项目已进入基础需求收口期，但尚不能宣称所有初始需求 100% 完成。

> 最新开发入口：X3-B1 已在原有右侧 XLSX 工作面加入数组/动态数组只读清单、范围定位、缓存覆盖提示和前后端写入保护；本地重算与行列结构迁移保持阻断。当前证据是确定性库生成样本，不能替代 Excel/WPS/LibreOffice 生产者验证。下一步为 X3-B2 三生产者差异矩阵与 spill 冲突只读诊断，详见 [`X3_B1_XLSX_Array_Formula_Readonly_Boundary_Audit_2026-07-30.md`](./X3_B1_XLSX_Array_Formula_Readonly_Boundary_Audit_2026-07-30.md)。

> X3-B2 最新检查点：spill 只读诊断已增加缓存完整度、序列化占用和外来公式冲突信号；WPS Spreadsheets `12.0/26895` 已完成真实打开、另存、应用退出、独立复开和 LongEdit 反向复读，生产者矩阵为 `partial 1/3`。Excel 与 LibreOffice 因本机环境缺失仍待补，能力继续标记为受限。详见 [`X3_B2_XLSX_Array_Producer_and_Spill_Diagnostic_Audit_2026-07-30.md`](./X3_B2_XLSX_Array_Producer_and_Spill_Diagnostic_Audit_2026-07-30.md)。

> X3-B3 已完成：数组公式诊断新增缓存值类型分布、错误缓存地址、具体冲突地址和一键定位；功能继续位于原有右侧 XLSX 工作面，没有新增独立页面。真实 Tauri 专业明/暗主题、1280/1024 视口共 10 项检查和 2 张截图通过，源 XLSX 字节不变。计算与数组写回仍阻断，生产者矩阵仍为 `partial 1/3`。下一代码阶段为 X3-B4 的可控冲突/错误 fixture 桌面定位闭环；外部环境到位时补齐 Excel/LibreOffice。详见 [`X3_B3_XLSX_Array_Cache_and_Conflict_Locator_Audit_2026-07-30.md`](./X3_B3_XLSX_Array_Cache_and_Conflict_Locator_Audit_2026-07-30.md)。

> X3-B4 已完成：基于 WPS 往返样本派生受控诊断 fixture，在真实 Tauri 专业明/暗主题中分别点击并定位外来公式冲突 `D3` 与标准错误缓存 `D4`；12 项检查、2 张截图通过，源字节不变。诊断总数保留，地址最多返回 256 个并在右侧工作面显式提示截断。生产者矩阵仍为 `partial 1/3`，数组计算与写回继续阻断。下一代码阶段为 X3-B5 的 Excel/LibreOffice 外部证据交接包。详见 [`X3_B4_XLSX_Array_Conflict_Desktop_Closure_Audit_2026-07-30.md`](./X3_B4_XLSX_Array_Conflict_Desktop_Closure_Audit_2026-07-30.md)。

> X3-B5 已完成：正版 Microsoft Excel 与 LibreOffice Calc 可在各自可信机器上对固定数组基线执行原生保存、退出、独立进程复开和 LongEdit 语义复读，并导出固定三成员证据包；导入端绑定基线摘要、生产者身份、生命周期、输出摘要和项目自身解析结果，拒绝覆盖既有证据。5/5 伪造/损坏包均确认不会修改矩阵、能力契约或创建目标；合法 TEMP 隔离包已验证可原子提升到 2/3。完整 `ci:check` 通过 Rust 功能测试 `383/383`、性能测试 `1/1`、PDF 100 MiB 范围基准约 `50 ms`，生产依赖审计为 `0` 漏洞。当前机器没有两套可信生产者，因此矩阵如实保持 `partial 1/3`，公开能力仍为只读受限，数组计算和写回继续阻断。详见 [`X3_B5_XLSX_Array_Producer_Evidence_Handoff_Audit_2026-07-30.md`](./X3_B5_XLSX_Array_Producer_Evidence_Handoff_Audit_2026-07-30.md)。

> X3-B6 已完成可执行收口：新增只读环境审计和 Excel+LibreOffice 双包矩阵级原子关闭器。两包先在 TEMP 中分别通过 B5 全门禁并形成隔离 `3/3`，随后才一次性提升四个 fixture/manifest、生产者矩阵与共享能力契约；第二包损坏时目标状态经自动化确认保持 `1/3`。完整 `ci:check` 通过 Rust `383/383`、性能 `1/1` 和 `0` 生产依赖漏洞。本机 Excel COM 仍指向 WPS `et.exe`，LibreOffice 缺失，因此没有登记虚假生产者证据，公开能力保持受限。详见 [`X3_B6_XLSX_Array_Producer_Matrix_Atomic_Closure_Audit_2026-07-30.md`](./X3_B6_XLSX_Array_Producer_Matrix_Atomic_Closure_Audit_2026-07-30.md)。

> 当前阶段交付证据见 `docs/E1B_ODT_Read_Index_Checkpoint_Audit_2026-07-28.md` 和 `docs/E1B_ODT_Producer_Gate_Progress_Audit_2026-07-28.md`。E1B 已完成有界语义解析、WorkspaceGuard 只读命令、Library 工作面、双索引和定位代码；LibreOffice 与 Microsoft Word 真实 fixture 已通过。Word 原阻塞已定位为 ODT 格式兼容性模态提示并完成受控保存、关闭和原生重开；WPS 缺少可验证的 ODF 组件并生成错误 OLE 文件。`.odt` 仍未进入共享格式注册表，下一批只关闭 WPS 生产者门禁。

> 2026-07-29 又完成 E1B Word/LibreOffice 真实 Tauri 桌面子门禁：正常/紧凑、专业明/暗、文内搜索、`odt-block` 路由定位和源字节不变共 8 项检查、4 张截图通过。证据见 `docs/E1B_ODT_Desktop_Evidence_Audit_2026-07-29.md`；该结果不改变 WPS blocked 和 `.odt` 未注册边界。

> 同日完成 WPS 关闭候选自动接入：桌面审计现在区分 `checkpoint` 与 `closure-candidate`，只有 WPS fixture/manifest 成对存在且原生保存、同生产者复开、隐私净化、大小和 SHA-256 全部匹配，才追加 WPS 明色搜索与暗色紧凑定位证据。详细合同见 `docs/E1B_WPS_Closure_Automation_Audit_2026-07-29.md`。

> E1A 完整 `ci:check` 通过 Rust 功能测试 `363/363`、性能测试 `1/1`，生产依赖审计为 `0` 漏洞；ODF 仍未进入产品格式注册表。

> E1B 生产者门禁 2/3 检查点完整 `ci:check` 通过 Rust 功能测试 `367/367`、性能测试 `1/1`，生产依赖审计为 `0` 漏洞；LibreOffice 与 Microsoft Word ODT 已通过真实解析和同生产者重开，WPS 单点阻断状态由 `shared/odt-read-contract.json` 固定。
> 实现提交 `4a2d009` 的 GitHub Quality Gate 已通过：<https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30346127166>。

> A3R 专项真实桌面门禁为 8 项检查和 4 张截图；完整 `ci:check` 通过 Rust 功能测试 `354/354`、性能测试 `1/1`，生产依赖审计为 `0` 漏洞。

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
- G8-1 已把关系数量、入链/出链、孤立风险和局部图谱入口放进默认工作台、当前文件和全文搜索结果。
- G8-2A 已提供跨工作面共享关系侧栏，显示事实/结构/规划/语义分类、方向、定位和原文证据；未提取格式明确降级。
- G8-2B 已补齐同标签、智能集合、30 秒/32 条会话缓存，并以真实 PDF、Table、Canvas 桌面对象验证统一侧栏。
- JSON Canvas 可视化编辑，以及 Markdown、文件、Mermaid、表格图表等节点。
- Mermaid Diagram Studio，支持结构化编辑、预览与 SVG/PNG 导出。
- CSV/TSV 和开放 `.table.json` 表格编辑、图表、仪表盘、Markdown/Canvas 嵌入。
- XLSX 多工作表预览、空白/已有基础单元格编辑、连续/多区域、TSV 剪贴板、基础样式、公式重算、行高列宽和合并/取消合并，支持冲突检测及 OOXML 局部可靠写回；可将工作表转换为开放表格。
- PDF 分段读取、阅读、标注、OCR sidecar、全文索引和图谱关系。
- PDF B0～B2C 已完成页面草稿、隔离验证、原子无覆盖另存、PDF.js 重开、复杂兼容矩阵、按范围提取、多文件有序合并和指定位置插页；对象流、页面继承和扫描页进入安全子集，高风险对象稳定阻断，仍禁止覆盖源文件或已有目标。
- API Key 使用 Windows 系统凭据存储；旧配置中的明文 Key 会一次性迁移并清除。
- YAML、XML、TOML、INI/CONF/CFG、Properties、`.editorconfig`、`.gitignore` 已进入统一管理与可靠基础编辑。
- `.env` 系列默认遮罩且后端排除全文索引/知识图谱；必须在当前文件显式确认后才能显示和编辑原值。
- 常见 JavaScript/TypeScript、Python、Rust、Go、Java/Kotlin、C/C++/C#、Shell/PowerShell、SQL 和 Web 源文件支持语法高亮、搜索与轻量可靠编辑，但不提供 IDE 执行、调试或语言服务。
- DOCX C1-2A 已接入共享注册、WorkspaceGuard 与有界 OOXML 解析；原 Library 右侧工作面支持标题、段落、列表、表格、样式/编号语义、受限内部图片预览、目录、文内搜索和高级对象兼容画像，原文件只读。
- DOCX C1-2A 已解析 `styles.xml`、`numbering.xml` 和内部文档关系；白名单图片经过单图 4 MiB、总量 12 MiB、32 张和文件签名门禁后可在原右侧工作面真实显示。
- DOCX C1-2B 已解析页眉、页脚、脚注、尾注、批注、合并单元格、分页和基础节版式，建立正文引用双向定位并接入全局索引；原件继续只读。
- C0-2A 已由 Microsoft Word `16.0.20131` 真实创建并保存版本化 DOCX，完成隐私匿名化、Word 只读重开、SHA-256 清单和 Rust 解析回归。
- C0-2B 已由 WPS Writer `12.1.0.26895` 真实创建项目自有 DOCX，完成定向隐私处理、安装实例标识清理、WPS 只读重开、SHA-256 清单和 Rust 解析回归。
- C0-2C 已由 LibreOffice Writer `26.2.4.2` 真实导出项目自有 DOCX，完成只读隐私/外链扫描、LibreOffice 重开、SHA-256 清单和 Rust 解析回归。
- C0-2 三生产者统一矩阵和独立 CI 门禁已完成，Word/WPS/LibreOffice 均为 `verified`；运行时保存准备报告不再包含生产者缺失 blocker，C0-2 进度为 3/3。
- C2A 已建立 `word/document.xml` 单部件隔离补丁、文件签名/部件摘要双门禁、未修改部件 raw-copy、包差异白名单、临时副本复读和源文件不变证明；没有保存命令或用户编辑入口；该阶段完成时 C2 进度为 1/5，当前进度见下方 C2B 条目。
- C2B 已为安全普通段落和标题建立目标清单、文本摘要握手、精确 `<w:t>` 字节补丁、XML 实体往返与写后语义复读；复杂载体保持只读，仍没有保存命令或 UI 编辑入口；该阶段完成时 C2 进度为 2/5，当前进度见下方 C2C 条目。
- C2C 已将安全列表项和单段落非合并表格单元格加入目标清单；表格目标绑定正文表格块及零基行列坐标，多段落、合并、续格、嵌套和复杂载体继续只读；该阶段完成时 C2 进度为 3/5。
- C2D 已为安全单运行文本增加粗体/斜体/单下划线隔离补丁，并为单个正文内嵌图片增加替代文本补丁；复杂运行、浮动图片和媒体二进制继续只读，C2 进度为 4/5。
- C2E0 当时增加只读保存准备报告，检查源签名、隔离输出摘要、目标占用、源覆盖和三类生产者证据；该历史阶段固定阻断且证明未尝试写入，阶段完成时 C2 为 4/5。
- C2E 已完成用户可见的文本/基础样式/图片替代文本单次编辑、摘要握手、原子无覆盖另存、落盘结构/语义复读和源字节复核；同一输出已由 Word、WPS、LibreOffice 复开，C2 进度为 5/5。
- C3A 已完成 PPTX 有界 OOXML 读取、幻灯片顺序、文本/图片/基础对象坐标、备注、搜索定位、兼容画像和只读放映；原件没有任何写回命令。
- C3D 已补齐 WPS Presentation 12.1 真实生成、隐私清理、原程序复开与 Rust 回读，PowerPoint/WPS/LibreOffice 矩阵达到 3/3；三尺寸、两主题桌面矩阵同时修复中窄屏备注隐藏和窄屏放映裁切，C3 只读阶段整体收口。
- C3B1 已接通 `slide -> layout -> master -> theme` 视觉继承链，解析页面背景、主题颜色/字体、对象填充/描边/旋转和基础文字样式，并由主舞台、缩略导航和只读放映消费；C3B 整体仍为部分完成。
- C3B2 已展开组合子对象并恢复组内坐标，解析图片裁剪/透明度和常用颜色变换；混合文本不再错误套用单一运行样式，而是带警告安全降级。该批完成时 C3B 仍为部分完成。
- C3B3 已完成连接线、自由形状、基础表格和复杂图形框架的分级只读呈现；主画布、缩略图和放映共用真实对象渲染组件。C3B 只读视觉实现已收口，C3 整体仍为部分完成。
- C3C1 已建立共享 PPTX 搜索段，覆盖文件名、幻灯片标题/正文、对象文本/替代文本/表格和备注；持久化索引与实时扫描消费同一生成器并通过真实 PowerPoint/LibreOffice fixture、结果一致性和源字节不变回归。注册表索引能力已提升为 `supported / pptx`，PPTX 仍严格只读。
- C3C2 已让 Library 搜索结果在右侧 PPTX 工作区精确定位幻灯片、对象和备注；支持缩略图滚动、对象持续高亮、备注面板、重复定位令牌和异步竞态仲裁。真实 Tauri 审计同时修复了 PPTX 阅读命令未注册 `WorkspaceGuard` 的装配错误。
- C3C3 已让 PPTX 文件和幻灯片进入统一 KnowledgeObject 与图谱快照，生成文件→幻灯片 `contains` 关系；当前幻灯片复用共享关系侧栏并可作为图谱中心，切换缩略图实时同步上下文，仍保持 Library 右侧内嵌与源文件只读。
- C3C4 已完成 PPTX 索引缺失、重建、过期、删除与源文件删除全生命周期回归；Library 可见过期状态并安全实时回退，资源上限和真实桌面搜索→关系→图谱→返回链路均已验证。C3C 整体收口。
- A5/G8/B0/B1A/B1B/B1C/C0/C1/C2E 已用真实 Tauri Debug/WebView2 自动化完成 36 项检查和 28 张证据图。

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
- `docs/Formula_Calculation_Compatibility.md`：S8-6A～S8-6F 公式函数族、错误分类、查找/日期语义、真实 fixture 和明确排除项。
- `docs/XLSX_Advanced_Data_Object_Contract.md`：S8-7 高级对象离线策略、透视候选审计、内存聚合预览和写回门禁。
- `docs/T8_1B_Theme_Desktop_Visual_Audit.md`：四套场景主题、真实 Tauri 三档尺寸证据、图谱紧凑布局修复和可重复截图脚本。
- `docs/Development_Progress_Audit_2026-07-24.md`：当前完整候选能力、风险排序、发布门禁，以及合并后从 XLSX 专项收尾切换到统一文件管理 A0 主线的顺序。
- `docs/Development_Progress_and_Direction_Audit_2026-07-27.md`：当前 30 类格式/62 个扩展名的能力分层、原始需求对齐、关键缺口和 DOCX～发布矩阵退出条件；这是最新综合审计入口。
- `docs/Unified_File_Manager_Format_Requirements.md`：统一文件管理、常用格式阅读/基础编辑、安全保存和体系化管理的补充需求基线。
- `docs/Next_Development_Execution_Guide.md`：A0～A5、PDF 页面编辑、DOCX/PPTX 基础工作面和体系化管理增强的后续执行指导。
- `docs/C0_C1_DOCX_Structured_Reading_Audit_2026-07-27.md`：DOCX 首批结构化阅读、安全预算、兼容画像、桌面证据、明确边界和后续收口顺序。
- `docs/C1_2A_DOCX_Styles_Numbering_Media_Audit_2026-07-27.md`：DOCX 样式继承、列表编号、内部媒体关系、安全预览门禁和真实生产者缺口。
- `docs/C1_2B1_DOCX_Related_Content_Index_Audit_2026-07-27.md`：DOCX 附属内容、正文引用、全局索引、对象定位、安全预算和 C1-2B 剩余边界。
- `docs/C1_2B2_DOCX_Layout_Desktop_Audit_2026-07-27.md`：DOCX 合并单元格、分页、基础节版式、真实桌面证据和 C1-2B 收口判定。
- `docs/C0_2A_Microsoft_Word_Producer_Fixture_Audit_2026-07-27.md`：Microsoft Word 真实生产者环境、版本化 fixture、隐私匿名化、重开、哈希和解析回归。
- `docs/C0_2BC_DOCX_Producer_Matrix_Intake_Gate_Audit_2026-07-27.md`：Word/WPS/LibreOffice 三生产者统一状态、证据接入规则和防伪 CI 门禁。
- `docs/C0_2B_WPS_Writer_Producer_Fixture_Audit_2026-07-27.md`：WPS Writer 真实生产者环境、定向隐私处理、原程序重开、哈希与解析回归。
- `docs/C0_2C_LibreOffice_Writer_Producer_Fixture_Audit_2026-07-27.md`：LibreOffice Writer 真实生产者环境、可重复生成、隐私扫描、原程序重开、哈希与解析回归。
- `docs/A5_Desktop_Acceptance_Audit_2026-07-26.md`：阶段 A 桌面级收口、真实证据矩阵、能力边界和 G8 图谱产品化入口。
- `docs/Library_Right_Pane_Workspace_Audit_2026-07-26.md`：知识库内嵌/外部独立空间模式、视觉尺度和路由入口合同。
- `docs/Text_Editor_Architecture_Decision.md`：A2 TXT 编辑器选型、CodeMirror 6 职责边界、大文件策略和后续扩展约束。
- `docs/JSON_Editor_Architecture_Decision.md`：A3 JSON/JSONC 解析器、源码事实源、注释/重复键/高精度边界和分批开放门禁。
- `docs/C2A_DOCX_Isolated_Package_Patch_Audit_2026-07-27.md`：DOCX 单部件隔离补丁、包差异、临时副本重开和禁止原件写回边界。
- `docs/C2B_DOCX_Paragraph_Heading_Isolated_Edit_Audit_2026-07-27.md`：安全段落/标题目标枚举、精确文本补丁、语义复读和复杂对象拒绝边界。
- `docs/C2C_DOCX_List_Table_Isolated_Edit_Audit_2026-07-27.md`：安全列表项、表格行列坐标、单段落非合并门禁和写后坐标稳定性。
- `docs/C2D_DOCX_Style_Image_Isolated_Edit_Audit_2026-07-27.md`：基础字符样式、内嵌图片替代文本、复杂运行/浮动图片拒绝和媒体字节保真。
- `docs/C2E0_DOCX_Save_Readiness_Gate_Audit_2026-07-27.md`：DOCX 源冲突、目标占用、生产者证据缺口和不写入保存准备门禁。
- `docs/C2E_DOCX_Reliable_Save_Audit_2026-07-27.md`：DOCX 基础编辑副本、原子无覆盖创建、落盘复读、源文件保护和三生产者输出复开。
- `docs/C3A_PPTX_Structured_Readonly_Audit_2026-07-27.md`：PPTX 安全解析、结构化只读工作面、2/3 真实生产者矩阵、明确边界和 C3B～C3D 收口顺序。
- `docs/C3B1_PPTX_Theme_and_Basic_Style_Audit_2026-07-27.md`：PPTX 主题/母版/布局背景继承、基础对象与文字样式、真实 fixture 回归及 C3B2～C3D 退出条件。
- `docs/C3B2_PPTX_Group_Image_and_Color_Audit_2026-07-27.md`：PPTX 组合子对象/坐标、图片裁剪透明度、颜色变换、混合文本降级和 C3B3 后续边界。
- `docs/C3B3_PPTX_Object_Rendering_and_Thumbnail_Audit_2026-07-27.md`：PPTX 连接线/自由形状/基础表格、复杂对象分级卡面、共享对象渲染器、真实画布缩略图和 C3C/C3D 后续边界。
- `docs/C3C1_PPTX_Index_Core_Audit_2026-07-27.md`：PPTX 共享搜索段、持久化索引/实时扫描一致性、稳定定位元数据、源文件不变证明和 C3C2 入口。
- `docs/C3C2_PPTX_Precise_Locator_Audit_2026-07-27.md`：Library 内嵌搜索定位、幻灯片/对象/备注消费、重复令牌、请求级工作区守卫修复和真实桌面证据。
- `docs/C3C3_PPTX_Knowledge_Object_Relation_Audit_2026-07-27.md`：PPTX 文件/幻灯片对象、`contains` 关系、对象级共享关系侧栏、图谱回流和真实桌面证据。
- `docs/C3C4_PPTX_Index_Desktop_Closure_Audit_2026-07-27.md`：PPTX 索引完整生命周期、资源上限、过期可见状态、实时回退和真实桌面综合闭环。
- `docs/C3D_PPTX_Producer_and_Visual_Closure_Audit_2026-07-27.md`：WPS 真实生产者、三生产者矩阵、三尺寸/两主题桌面证据、中窄屏备注和全窗口放映修复。
- `docs/C4D_PPTX_Reliable_Save_Copy_Audit_2026-07-27.md`：PPTX 统一受限操作、原子无覆盖新副本、写后结构/语义复读、源文件保护和真实桌面重开证据。
- `docs/C4E_PPTX_Output_Producer_Reopen_Audit_2026-07-27.md`：三个真实输出副本、PowerPoint/WPS/LibreOffice 外部复开和 3/3 发布门禁。
- `docs/C5A1_PPTX_Isolated_Image_Replacement_Audit_2026-07-28.md`：单引用 PNG/JPEG 安全目标、单媒体部件隔离替换、可靠新副本、真实桌面证据和 C5A2 外部复开入口。
- `docs/C5A2_PPTX_Image_Output_Producer_Reopen_Audit_2026-07-28.md`：图片替换输出的 PowerPoint/WPS/LibreOffice 3/3 复开、目标图片解码和只读哈希证明。
- `docs/C5B_PPTX_Basic_Shape_Lifecycle_Audit_2026-07-28.md`：白名单基础形状新增/删除、可靠新副本、真实桌面证据和三生产者输出复开。
- `docs/Development_Progress_and_Direction_Audit_2026-07-27_C3B3.md`：C3B3 后总体进度、C3C 索引/定位/关系架构审计、C3D～C5 阶段拆分和后续格式方向。
- `docs/Development_Stage_Audit_2026-07-22.md`：当前阶段审计、设计对齐、Table 子阶段收尾和 Excel 等价后续七个主阶段。
- `docs/Development_Stage_Audit_2026-07-20.md`：上一轮专业工作区阶段审计和交错排期基线。

## 5. 验证基线

当前本地候选验证结果：

- A0 第一批：`shared/file-formats.json` 已升级到 schema v2；前端和 Rust 注册表均消费用户能力等级与保存模式；最长扩展名优先路由已覆盖 `.table.json` 等复合扩展名；Library 文件树、状态栏和保存入口已开始按能力模型展示与阻断。
- A1 第一批：新增 `src-tauri/src/formats/text.rs` 文本快照内核；通用文本读写现在保留编码、BOM、换行符和末尾换行，保存前校验读取签名并拒绝外部覆盖，Library 状态栏显示编码/BOM/换行快照。
- A1 第二批：后端已支持显式编码读取、显式编码/BOM/换行转换、GBK 中文 fixture、只读覆盖阻断和写后语义重读验证；前端编码选择入口、GB18030 更广 fixture、大文件范围读取和结构化错误仍是 A1 收口项。
- A1 收口批第一段：Library 文本工作面已提供编码菜单，可按 UTF-8/UTF-8 BOM/GBK/GB18030 重新读取或转换保存；读写调用分别传递 `readOptions` 与 `savePolicy`，并在每个标签记忆用户选择的读取编码。
- A1 收口批第二段：新增 `TextDocumentError` 结构化错误，读写命令返回稳定错误码、可恢复标记和建议；新增 GB18030 扩展汉字 fixture，前端错误提示会展示恢复建议。
- A1 收口批第三段：新增单次最大 1 MiB 的文本范围读取、多字节边界连续性测试和 `read_text_document_range` 命令；超过 20 MiB 完整编辑阈值时，Library 自动进入大文件只读预览，支持按需继续加载、按编码重读，并禁用保存与自动保存。
- A2 第一批：采用 CodeMirror 6 并新增独立 TXT 工作面；已接通行号、查找替换、跳行、撤销重做、编码/BOM/换行保存策略、外部签名冲突和 A1 大文件范围模式，选型边界见 `docs/Text_Editor_Architecture_Decision.md`。
- A2 第二批：已接通最近文件、系统文件选择/启动参数/单实例事件的外部 `.txt` 路由、外部 TXT 可靠读写，以及设置页和编辑器内可控制的 1.5 秒防抖自动保存；外部授权保持进程级，不把不可恢复授权的外部路径持久化为最近项。
- A2 第二批验证：生产构建通过，Rust 功能回归 `204/204` 通过，格式契约和 `cargo fmt --check` 通过，`npm audit --omit=dev` 为 0 个漏洞；真实 Tauri 系统打开、保存、重启证据仍按计划留给 A5。
- A2 最后一批：新增共享 `WorkspaceTabs.vue`，Markdown/TXT 统一切换和关闭；TXT 脏草稿及编码/签名/范围状态保存在内存标签，外部授权标签不跨重启；知识库切换、彻底退出和页面卸载统一检查未保存内容。
- A2 最后一批验证：生产构建、Vue 类型检查、格式契约和 Rust 功能回归 `204/204` 已通过；构建仅保留既有大分包警告。
- A3 第一批：普通 `.json/.jsonc` 已注册为只读源码预览，新增 CodeMirror JSON 工作面和 Rust `jsonc-parser` 权威诊断；`.table.json` 最长扩展名路由、JSON/JSONC 模式差异、重复键、高精度数字、结构统计和 Unicode 诊断跳转均有代码或契约保护。
- A3 第一批验证：生产构建、Vue 类型检查、格式契约和 Rust 功能回归通过，npm 正式源依赖审计为 0 个漏洞；构建仅保留既有大分包警告。
- A3 第二批：JSON/JSONC 已提升为基础源码编辑，支持 280 ms 实时 Rust 校验、共享标签内存草稿、`Ctrl+S`/全局保存、非法源码明确确认、读取签名冲突保护和可靠写后重读；通用文本写入无法绕过专用 JSON 语法门禁。
- A3 第二批验证：生产构建、Vue 类型检查、格式契约和 Rust 功能回归 `215/215` 通过；npm 正式源依赖审计为 0 个漏洞，构建仅保留既有大分包警告。
- A3 第三批：源码工作面新增搜索、全部折叠/展开、保真格式化/压缩，以及最多 20,000 节点的 JSON Path 目录、筛选、定位和复制；Rust 变换使用原始 token 切片，保留重复键、数字字面量、字符串转义、JSONC 注释和尾随逗号。
- A3 第三批验证：定向 Rust 回归 `15/15`、全量 Rust 功能回归 `220/220`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；npm 正式源依赖审计为 0 个漏洞，构建仅保留既有大分包警告。
- A3 第四批：新增源码/树形双视图；树形预览消费 Rust AST 标签、深度、子项数与源码范围，支持逐节点/全部折叠、节点选择、原始源码复制、路径复制和源码定位，重复键不会在前端对象化后合并。
- A3 第四批验证：生产构建、Vue 类型检查和 JSON 定向 Rust 回归 `15/15` 通过；树形 DOM 设置 2,000 可见节点预算，结构修改继续禁用。
- A3 第五批：Rust 新增精确 AST 范围标量替换；树形视图可编辑字符串、数字、布尔值和 `null`，支持标量类型变化、陈旧草稿保护、单次撤销事务和替换后重新分析。重复键、精度敏感数字、容器和非法字面量继续阻断。
- A3 第五批验证：定向 Rust 回归 `20/20`、全量 Rust 功能回归 `225/225`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第一段：Rust 路径目录新增对象键精确范围，树形视图开放对象键重命名；新键由 Rust JSON 序列化器编码，支持 Unicode、转义与空键，保持值、空白、注释和尾随逗号不变。重复键、精度敏感数字、错位范围、陈旧草稿与超长键稳定阻断。
- A3 第六批第一段验证：JSON 定向 Rust 回归 `23/23`、全量 Rust 功能回归 `228/228`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第二段：Rust 新增对象属性尾部补丁，树形对象节点开放新增属性；支持空对象、紧凑/多行布局、JSONC 尾随逗号、Unicode/空键和任意可保真严格 JSON 值。尾部注释、重复键、错位范围、陈旧草稿、超长键和精度敏感值稳定阻断。
- A3 第六批第二段验证：JSON 定向 Rust 回归 `27/27`、全量 Rust 功能回归 `232/232`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第三段：Rust 新增数组项尾部补丁，树形数组节点开放追加项；支持空数组、紧凑/嵌套/多行布局、JSONC 尾随逗号和任意可保真严格 JSON 值。尾部注释、错位范围、陈旧草稿和精度敏感值稳定阻断。
- A3 第六批第三段验证：JSON 定向 Rust 回归 `31/31`、全量 Rust 功能回归 `236/236`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第四段：Rust 新增对象属性删除补丁，树形属性节点开放带确认删除；覆盖首项、中间项、末项、唯一属性和 JSONC 尾随逗号。目标两侧分隔符归属不明确、存在邻接注释、范围陈旧或文档有保真风险时稳定阻断。
- A3 第六批第四段验证：JSON 定向 Rust 回归 `35/35`、全量 Rust 功能回归 `240/240`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A3 第六批第五段：Rust 新增数组项删除补丁，分析结果提供权威数组索引，树形数组项开放带确认删除；覆盖首项、中间项、末项、唯一项和 JSONC 尾随逗号。目标两侧分隔符归属不明确、存在邻接注释、范围陈旧或文档有保真风险时稳定阻断。
- A3 第六批第五段验证：JSON 定向 Rust 回归 `39/39`、全量 Rust 功能回归 `244/244`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；构建仅保留既有大分包警告。
- A4 第一批第一段：`.log` 已进入共享格式注册、文件树、统一标签路由和有界文本索引；独立只读工作面提供内容/级别筛选、时间与级别高亮、末尾范围、2 秒自动刷新、尾部跟随、轮转重载、512 KiB 单次读取和 4 MiB 显示缓冲上限。显式编辑仍为 `planned`，真实桌面刷新证据并入 A5。
- A4 第一批第一段验证：注册表定向 Rust 回归 `4/4`、全量 Rust 功能回归 `245/245`、生产构建、Vue 类型检查、格式契约和 `cargo fmt --check` 通过；格式契约覆盖 `11` 种格式和 `14` 个扩展名，构建仅保留既有大分包警告。
- 前端生产构建、主题/格式/工作簿/XLSX 发布契约检查均通过；工作簿契约已覆盖 S8-2A 的 Table 创建/调整入口、签名事务、包级往返、历史清理、重载与重算。
- Rust：S8-7E2F 后完整门禁为 367 项功能测试、1 项性能测试，全部通过；七类聚合及单行轴、单列轴、三度量共 10 个临时 Pivot 包完成结构、语义、输出值、输出样式和未触及部件复读，成功/阻断路径原文件字节保持不变。
- 本批完整性能回归通过：`inspect=249 ms / page=2,696 ms / patch=2,616 ms / total=5,562 ms`，未放宽 `10000x12` 负载、时间或 5% 文件增长约束。
- 当前完整门禁：367 项 Rust 功能测试、1 项性能测试、全部格式与证据合同、前端生产构建和 PDF 范围基准通过；生产依赖 0 漏洞。真实 Tauri 专项证据继续以各阶段固定清单为准。
- `npm audit --omit=dev`：0 个漏洞。

Vite 仍会提示少数 Mermaid/UI 分包压缩后超过 500 KiB；这是性能优化项，不是构建失败。

## 6. 下一阶段顺序

当前代码顺序：**R2 Windows 安装与生命周期边界**。R1 统一发布能力矩阵已完成；E1B WPS ODT 生产者与 X3-B6 数组生产者属于并行外部证据门禁，不得伪造关闭。高风险交换格式继续只生成可靠新副本。

2026-07-29 已完成 E1B WPS ODF 环境门禁加固：`scripts/audit-e1b-wps-odf-environment.ps1` 以隔离 `SaveAs2(..., 23)` 探测固定 WPS `12.1.0.26895` 的 0 个文件转换器、0 个 ODF 组件和 OLE 复合文档输出；证据为 `fixtures/odt/producers/wps-writer-blocker.json`。fixture 生成器现在先做强制预检并在净化前后验证 ODT ZIP，阻断时无无效 fixture 或临时目录残留。E1B 仍为 2/3，`.odt` 仍未注册；详细审计见 `docs/E1B_WPS_ODF_Environment_Gate_Audit_2026-07-29.md`。

2026-07-29 已完成 E1B 当前可执行桌面证据：`npm.cmd run audit:e1b-odt-desktop` 使用 `tauri.e2e.conf.json` 在隔离工作区驱动真实 WebView2，Word/LibreOffice 的两档布局、两套专业主题、搜索和精确定位均通过，清单为 `docs/evidence/e1b-odt-desktop/audit-manifest.json`。下一步只在可信 WPS ODF 环境到位后生成 WPS fixture、补录 WPS 桌面场景、达到 3/3 后登记 `.odt` 为 `preview-only`。

WPS 桌面补录代码已准备完成：真实 `wps-writer.odt` 到位后，同一命令会自动验证 manifest/SHA-256 并生成三生产者 6 场景 `closure-candidate` 清单，无需再手工改桌面脚本。当前仍不得把“自动化就绪”写成“WPS 已通过”。

以下内容是 2026-07-24 的历史阶段记录，用于追溯实现，不再代表当前暂停点。

2026-07-24 暂停点状态、质量证据、风险和逐批退出条件见 `docs/Development_Pause_Audit_2026-07-24.md`；当时的综合审计见 `docs/Development_Progress_Audit_2026-07-24.md`，上一轮细节见 `docs/Development_Progress_Audit_2026-07-23.md`，历史阶段拆分依据见 `docs/Development_Stage_Audit_2026-07-22.md`。这些文档记录的是 A4 开始前的历史状态；A4/A5、G8、PDF B0～B1C、DOCX C1-2A 和 S8-7E2F 后续均已完成，不得再把历史暂停点当作当前恢复点。X2～X5 / S8-7 后续～S8-8 继续保留为 XLSX 专项队列。

当前 `v0.7.0` 基线已完成知识库文件树的创建、移动、重命名、删除、排序、扫描和状态读取路径守卫，并修复旧 API Key 迁移失败丢失及远程 HTTP 传输风险。

1. 完成 FR-BASE-001/007：拖拽导入现由 Rust 系统事件授权；历史缓存区分知识库与外部文档；图片读取要求被当前 Markdown 精确引用。下一批继续审计少量平台和导出命令。
2. FR-INDEX-004/FR-FORMAT-001 已完成：前后端消费 `shared/file-formats.json`，创建、打开、工作区扫描、外部授权和索引均由能力与适配器契约分派；`.txt` fixture 证明同类格式扩展不再修改根级白名单。
3. FR-DATA-009 的 S6-11、S8-2A～S8-4D4 已完成冻结窗格、数据视图、普通 Table、基础排序筛选、命名区域、数据验证、受限条件格式，以及标准双单元格锚点绘图对象、已有标准图表标题/内部一维系列引用编辑、基础图表生命周期、标准单轴坐标轴标题、图例位置、系列显示名、基础图表级数据标签和有限直接 RGB 系列颜色；工作面可从连续选区创建柱形/折线/饼图/散点图、安全删除、受限切换类型并编辑安全表达子集。本地预览已消费轴标题、图例方位和系列颜色。四类图表真实 fixture、命令往返和 Tauri 保存重开证据见 `S8_4D4_Chart_Desktop_Visual_Audit.md`。单点/绝对锚点、复杂组合图、逐点/自定义标签、高级主题色语义、高级轴格式和高级筛选仍未开放，边界见 `XLSX_Public_Compatibility_Matrix.md`。
4. T7-1 已完成：唯一主题注册表、专业浅色/深色/高对比预设、统一持久化、编辑器/图表消费者与结构门禁已交付；视觉矩阵见 `docs/Theme_Preset_Contract_and_Visual_Matrix.md`。
5. F7-2 已完成：OPML 树形/思维导图双视图、拖拽层级、折叠、搜索、撤销重做、可靠往返、语义索引和 Canvas 投影已交付；兼容边界见 `docs/OPML_Mind_Map_Editor_Design.md`。
6. G7-2 已完成：全局图谱节点详情可直接建立和删除七类语义关系，关系可靠写入 Markdown Frontmatter；路径、关系类型、内容签名、删除证据和原子写入均由后端验证。
7. FR-DATA-009 的 S6-12 已完成：读取图表/图片关系、锚点、标题和系列来源，工作面提供结构卡片与定位；对象编辑和像素级渲染仍未开放，单元格写回通过 Drawing/Chart/媒体逐字节保真门禁。
8. FR-DATA-009 的 S6-13 已完成：透视表、切片器、外部链接和数据连接进入脱敏结构清单；外部目标不跟随，敏感连接内容不进入 IPC，刷新/计算/交互编辑仍未开放。
9. FR-DATA-009 的 S6-14 与 S8-5A～S8-5C 已完成：打印区域、页面设置、页眉页脚、打印选项与保护状态进入结构化摘要；单连续打印区域、纵横方向、五种常用纸张、百分比/适页缩放、六项页边距、奇偶页/首页六个标准页眉页脚文本和四个标准标志，以及网格线、行列标题、居中、黑白、草稿和首页页码可安全编辑。保护材料不进入 IPC，受保护 Sheet 写回整批拒绝，打印预览、图片型页眉页脚和解锁仍未开放。
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
22. S8-1B3 已完成：整行插入/删除已接入连续整行选择和签名保护事务；脏草稿、保护 Sheet 和删除确认形成前端防线，成功后清空旧坐标历史、重载分页、恢复选区并重算已加载公式。
23. S8-1C 已完成：整列插入/删除复用轴向迁移内核和签名保护事务，覆盖列定义、冻结列、工作表范围载体、Chart/Drawing/计算链关系与前端提交后恢复；Table 列数变化和活动筛选条件继续明确拒绝。
24. S8-2A 已完成：普通 Excel Table 支持从连续选区创建、范围扩缩和表头列同步；事务维护 Sheet 引用、关系、内容类型与 Table 部件，并拒绝活动筛选、汇总行、计算列及扩展元数据。
25. S8-2B 已完成：Table 改名、内置样式与首列/末列/行列条纹选项，以及转换为普通区域/删除 Table 定义已接入工作面；包级事务维护名称唯一性、Sheet 引用、关系、内容类型和 Table 部件，结构化引用及复杂 Table 元数据继续明确拒绝。
26. S8-2C 已完成：Table 与工作表 AutoFilter 支持单列包含筛选、单列升降序状态和清除条件；重载恢复同一数据视图，高级/多列条件只读且覆盖操作拒绝，明确确认后可清除。
27. S8-3A 已完成：名称框支持创建、更新引用、改名和删除工作簿级/Sheet 级安全单一 A1 命名区域；事务校验名称、作用域、结构保护、内容签名与 OOXML 包，隐藏/系统名称只读，被公式引用的名称拒绝改名或删除。
28. S8-3B 已完成：连续选区支持创建列表、整数、小数、文本长度和自定义公式数据验证，已有规则可编辑、重新应用选区或删除；事务校验签名、Sheet 保护、范围重叠、外部引用、复杂扩展与 OOXML 包，公式规则仅写入保真而不伪执行。
29. S8-3C1 已完成：基础数值 `cellIs` 条件格式支持读取、视觉执行、创建、编辑、重新应用范围和删除；复杂规则可见、只读并保真，事务维护 DXF、优先级、签名保护与包验证。
30. S8-3C2A 已完成：直接 A1 引用与数字/文本/布尔字面量比较支持相对/绝对引用迁移、视觉执行和安全编辑；函数、区域、跨 Sheet 与复合表达式只读保真。
31. S8-3C2B1 已完成：固定数值双色/三色色阶支持 RGB 插值、创建、编辑、范围重应用和删除；动态阈值只读，色阶写回不修改 DXF 样式部件。
32. S8-3C2B2 已完成：后端完整范围统计解析 min/max、百分比和百分位阈值，返回解析值供分页工作面可靠渲染；公式阈值只读并设有规则数/样本数上限。
33. S8-3C2C1 已完成：标准 OOXML 非负固定阈值数据条支持读取、渲染、创建、编辑、范围重应用和删除；颜色、数值显隐、条长及 DXF 不变进入回归，并修复 `x14:` 扩展节点误解析。
34. S8-3C2C2 已完成：数据条支持 min/max/percent/percentile 完整范围解析、负数固定阈值及跨零自动轴渲染；`x14:` 负值颜色、方向和边框等高级样式继续只读保真。
35. S8-3C2D 已完成：Excel 2007 标准 3/4/5 图标集支持完整范围阈值解析、渲染、创建、编辑、重新应用范围和删除；反向、仅图标和严格阈值进入回归，自定义混合图标、公式阈值与 `x14:` 专属图标族只读保真。
36. S8-3C3A 已完成：当前单元格可切换查看多条命中规则、显示冲突顺序并提高/降低可编辑规则的全 Sheet 优先级；基础规则可编辑 `stopIfTrue`，优先级事务只改写属性并保留公式、DXF 与只读复杂规则。
37. S8-3C3B 已完成：`groupIndex + ruleIndex` 精确寻址同范围多规则组，受支持规则可逐条编辑、删除和排序；兄弟规则及未知事件原样保留，共享范围禁止被单条规则隐式改变。
38. S8-3C3C1 已完成：共享规则可显式拆分到当前选区，独立同范围规则可重新组合；事务直接迁移原始 `cfRule` 事件，不重建公式、样式、优先级或 DXF。
39. S8-3C3C2 已完成：安全表达式支持有界 `AND/OR/NOT`、多 A1 引用、短路求值和依赖分页预取；区域、跨 Sheet、未知函数及超限公式只读保真。
40. S8-4A 已完成：建立绘图对象稳定身份和选择状态；标准双单元格锚点支持名称/替代文本编辑与按选区移动/缩放，写入受签名、保护和包校验约束。
41. S8-4B 已完成：已有标准标题和内部一维公式系列引用可安全编辑，旧系列缓存会移除；工作面按真实源单元格生成统一组件本地预览。
42. S8-4C 已完成：连续选区可创建柱形/折线/饼图/散点图，支持安全删除与标准结构间受限类型切换；图表模板和选区系列建模已抽离到 `workbook_chart`。
43. S8-4D1 已完成：标准单轴柱形/条形/折线/散点图可编辑分类轴与数值轴标题，标准安全图表可设置左/右/上/下/右上图例或隐藏；复杂、多轴和扩展图表只读。
44. 复杂工作簿写回性能阻断已关闭：选择性解压、XML 后缀保真、未修改 ZIP 部件原始复制和受控压缩使 `patch` 恢复至约 5.26 秒，完整 `ci:check` 通过。
45. 完善 FR-BASE-005：增加真实 Tauri 图表创建、保存、重开 E2E 和视觉矩阵。
46. S8-4D2 已完成：标准安全图表可编辑系列显示名和基础图表级数值/分类名/系列名标签，饼图额外支持百分比；高级逐点标签只读，本地预览同步低密度标签。
47. S8-4D3 已完成：标准安全系列可写回统一直接 RGB 填充/线条颜色；工作面提供当前主题 6 色板与 RGB 取色器，本地预览同步轴标题、图例方位和系列颜色；高级系列样式继续只读。
48. S8-4D4 已完成：柱形、折线、饼图和散点图具备真实 XLSX fixture、命令边界往返、专业浅色四类截图、专业深色/高对比代表场景，以及真实 Tauri 编辑、保存、进程重启和重开证据。
49. S8-5A 已完成：当前连续选区可设为或清除打印区域；页面设置面板支持方向、Letter/Legal/A3/A4/A5、百分比/适页缩放和六项页边距；事务具备签名、保护、包校验、语义重读与真实 Tauri 保存验证。
50. S8-5B 已完成：独立页眉页脚面板支持奇数页、偶数页和首页六个标准文本及四个标准标志；每字段限制 255 字符，覆盖特殊字符、字段代码、清空、超长拒绝、保护拒绝、包校验和语义重读。
51. S8-5C 已完成：独立打印选项面板支持网格线、行列标题、水平/垂直居中、黑白、草稿和 1–32767 可选首页页码；事务覆盖创建、更新、清除、保护拒绝、包校验和语义重读，页面阶段收尾。
52. S8-6A 已完成：机器清单固定 IronCalc 版本和显式内存重算模式；真实 XLSX 验证聚合、数学、逻辑、文本四族 16 个函数，以及除零、依赖错误传播、`IFERROR` 恢复、未知函数和稳定错误分类；命令边界与 workbook contract 已纳入门禁。
53. S8-6B 已完成：真实矩阵新增条件聚合和查找数据 Sheet，验证 `SUMIF/COUNTIF/AVERAGEIF` 与 `VLOOKUP/HLOOKUP/INDEX/MATCH` 的精确/升序近似匹配、通配条件、文本结果保型、`#N/A` 和恢复路径；机器清单扩展为六族 23 个函数。
54. S8-6C 已完成：真实矩阵新增多条件聚合和日期场景，验证 `SUMIFS/COUNTIFS/AVERAGEIFS` 与 `DATE/YEAR/MONTH/DAY` 的多条件、无匹配、Excel 1900 日期序列、闰年和错误传播；机器清单扩展为八族 30 个函数、41 个场景。尺寸不一致的 `*IFS` 范围因依赖行为不等价而明确排除。
55. S8-6 后续拆为 S8-6D 现代查找/引用与 S8-6E 数组、溢出、易失函数、外部引用分级验收；之后进入 S8-7 高级数据对象和 S8-8 发布审计。
56. S8-6D 已完成：`XLOOKUP` 进入第九个已验证函数族，真实矩阵扩展为 31 个函数、50 个场景；覆盖精确/近似、跨 Sheet、行向量、反向、通配、缺省值、`#N/A`、`IFERROR`、文本保型和草稿依赖重算。IronCalc 0.7.1 未实现 `XMATCH`，数组返回/溢出结果也未进入合同。
57. S8-6E 已完成：显式内存重算开放 `OFFSET/INDIRECT/RAND/RANDBETWEEN/TODAY/NOW`，机器清单扩展为十族 37 个函数、56 个场景；数组/动态数组在计算前安全拒绝，外部工作簿链接保持离线拒绝，源公式、缓存和包保真不受影响。S8-6 公式语义阶段收尾，下一步进入 S8-7。
58. S8-7A 已完成：新增高级对象机器合同、后端汇总/权威离线策略和工作簿专业审计面板；四类对象可查看安全元数据，本地对象可定位，刷新、编辑、外部跟随和敏感字段暴露继续禁止。下一步进入 S8-7B。
59. S8-7B 已完成：本地透视表可审计输出布局、缓存字段/类型、Cache Records、字段角色和聚合；真实 fixture 与命令边界验证 `candidate_for_rebuild`，未知或不完整结构返回稳定阻断原因。刷新和写回仍禁止，下一步进入 S8-7C 内存聚合预览。
60. S8-7C 已完成：候选本地透视表可从当前工作表值和未保存非公式草稿生成内存聚合预览；七种聚合、带类型分组、资源上限、签名冲突和文件字节不变已进入回归。工作表、Pivot Cache、透视定义和原文件均不写入，下一步进入 S8-7D 写回可行性审计。
61. S8-7D 已完成：逐对象核对 Pivot Field items、`rowItems/colItems`、页面筛选和输出区域单元格，返回 `blocked/structure_candidate` 与稳定阻断原因；两种状态均不允许写回。当前兼容 fixture 因缺少字段项、行列项和输出单元格保持阻断，下一步进入 S8-7E 真实生产者 fixture 与隔离重建原型。
62. S8-7E1 已完成：引入固定 Apache POI 上游提交、许可和 SHA-256 的真实 Excel Pivot fixture；一个本地范围对象通过完整结构审计，一个命名来源/页面筛选对象稳定阻断。普通单元格修改后两个 Pivot Table、两个 Cache Definition 和两个 Cache Records 部件逐字节不变。当前机器无 Excel/LibreOffice，桌面刷新保存往返仍待 S8-7E2 后补证，写回继续禁用。
63. S8-7E2A 已完成：新增 `preview_workbook_pivot_rebuild` dry-run 命令和审计面板“影响清单”，精确映射 Cache Definition、Cache Records、Pivot Table、输出工作表四类计划影响部件。命令校验签名、内存隔离副本和摘要，不写用户文件；完整候选进入 `isolated_dry_run_ready`，命名来源/页面筛选对象稳定阻断。下一步 S8-7E2B 只在临时副本中实际重建 Cache。
64. S8-7E2B 已完成：新增 `rebuild_workbook_pivot_cache_isolated_copy`，只在内存隔离副本中实际重建 Cache Definition 与 Cache Records；已验证字符串共享索引、数字直接值、日期共享索引，修正真实 fixture 的过期日期边界，并对包复读、对象语义、新摘要及未修改部件逐字节保真设置门禁。新共享项、公式来源、混合类型、页面筛选和过期签名稳定拒绝，用户文件始终不写入。下一步 S8-7E2C 同步重建 Pivot Field items、`rowItems/colItems` 与输出工作表。
65. S8-7E2C 已完成：新增 `rebuild_workbook_pivot_isolated_copy`，在同一内存副本同步重建 Cache Definition、Cache Records、Pivot Table 和输出工作表；保持隐藏 items，重建行列项、明细、行列总计和总计。真实 fixture 验证 2×2 可见布局、13 个输出单元格及来源数值 1→10 后总计 4→13；包、对象语义、输出值和未触及部件保真全部通过，用户文件仍不写入。下一步 S8-7E2D 扩展新 sharedItems 与布局扩缩容。
66. S8-7E2D 已完成：新增 `rebuild_workbook_pivot_expanded_isolated_copy`，根据当前源数据增删共享项并同步 Cache Records、Pivot items、`rowItems/colItems`、`location` 和输出区域；保持既有共享项顺序与隐藏状态，新项默认可见。真实 fixture 覆盖 `A3:D7 → A3:E8` 扩张和 `A3:D7 → A3:C6` 收缩，验证样式延伸、至少 7 个旧单元格清理、总计 6/4、包语义与未触及部件保真，用户文件仍不写入。下一步 S8-7E2E 验证聚合方式与布局变体。
67. S8-7E2E 已完成：新增 `verify_workbook_pivot_variants_isolated_copy`；`sum/count/average/max/min/product/countNums` 七类聚合各自生成临时 Pivot 包并通过联合重建、包校验、对象语义和输出值复读。真实来源进一步验证单行轴、单列轴及 `sum/count/average` 三度量语义矩阵。S8-7E2F 已在同一命令上继续完成 3 个布局隔离包，合计 10 个临时包，用户文件仍不写入。
68. T7-1 已建立主题扩展框架；该历史检查点当时有 3 套正式预设，随后 T8-1 已扩展并验收为 3 套核心 + 4 套场景预设。F7-2 已交付首个 OPML 新格式编辑器，后续 JSON/JSONC 与多类文本/配置格式也已进入统一工作面。
69. T8-1A 已完成：七套发布预设分为 3 个核心 + 4 个场景方案，设置页区分正式与兼容组合，预设可同步动效节奏，注册表新增 WCAG AA 正文对比度和层级数量门禁。下一批 T8-1B 补齐四套场景预设的真实 Tauri 视觉矩阵。
70. T8-1B 已完成：四套场景预设具备设置页 1440×900、工作台 1024×768、思维导图 760×900 共 12 张真实 Tauri WebView2 证据；修复紧凑图谱页头、工具栏溢出、筛选条和初始详情遮挡，并隔离 E2E 配置写入。
71. S8-7E3A 已完成：标准本地 Pivot 在隔离布局验证后可可靠另存为同目录新 `.xlsx`；事务绑定源签名和隔离输出摘要，拒绝源覆盖、已有目标、旧状态、路径片段和未保存草稿，写后复读 OOXML/Pivot 语义并再次确认源字节不变。下一步 S8-7E3B 补齐 Excel/LibreOffice/WPS 真实刷新保存重开矩阵。
72. S8-7E3B 已完成：LongEdit 标准 Pivot 新副本已由 Microsoft Excel `16.0/20228`、WPS Spreadsheets `12.0/26895`、LibreOffice Calc `26.2.4.2` 分别刷新、保存、退出进程并新进程重开；3/3 均保持 `PivotTable1`、`A3:D7`、`D7=4`，三份输出再由 LongEdit 反向复读。下一步 S8-7E3C 逐项扩展单轴和多度量新副本白名单。
73. S8-7E3C 已完成：单行轴、单列轴和三度量均进入可靠新副本白名单；隐藏项与生产者原生多级表头已修正，Excel/WPS/LibreOffice 9/9 往返通过，十二份 XLSX 由 LongEdit 反向确认 `PivotTable1`、字段来源和聚合。下一步 S8-7E3D 扩展其余单度量聚合。
74. S8-7E3D 已完成：`count/average/max/min/product/countNums` 六种单度量聚合均进入可靠新副本白名单；修正跨分组 `max/min/product` 总计，Excel/WPS/LibreOffice 18/18 往返与 OOXML `subtotal` 复读通过，二十四份 XLSX 由 LongEdit 反向复读。下一步 S8-7E3E 审计多层轴并建立隔离包原型。
75. S8-7E3E 已完成：由 Microsoft Excel `16.0/20228` 生成并独立重开双层行轴、双层列轴真实 fixture；新增多层轴隔离审计命令，解码 `r` 前缀压缩项并验证双轴各 4 条明细、2 条父级小计、1 条总计及 16 个预览分组。临时包只重建 Cache Definition/Records，Pivot Definition 和输出 Worksheet 逐字节保持不变，用户文件不写入。下一步 S8-7E3F 在临时包中完整重建多层轴定义与层级输出。
76. X3-A / S8-6F 已完成：IronCalc 固定升级至 `0.8.0`，真实 XLSX 公式矩阵扩展为 38 个函数、64 个场景；标量 `XMATCH` 的精确、反向、通配、相邻值、横向量、`#N/A`、恢复和未保存依赖重算通过模块与 Tauri 命令门禁。动态数组、数组常量、正则模式、外部工作簿计算和缓存写回继续阻断。

S8-5C 的真实 Tauri 隔离运行已确认面板布局和七项控件可见；桌面点击保存重开因用户两次停止自动化而未继续，等价保存 payload 已由真实兼容 fixture 的命令边界往返、清除和页面对象保真回归覆盖。

PDF B2A/B2B/B2C 已完成：可按显式页范围提取页面、将 2～16 个 Library PDF 显式排序后合并，也可把另一 PDF 的指定页面插到页前、页后或末尾；复用 B0～B1C 页面计划、兼容画像与安全另存内核，并验证跨输入页序、文本、页面几何、应用内重开、全部源文件不变及复杂/加密输入阻断。A3R 也已完成 JSON/JSONC 软件内创建与管理闭环；E0/E1A 已固定九格式路线及 ODF 可信包边界，下一批推进 E1B ODT 只读预览与索引。

## 7. 已知边界与注意事项

- 当前重点是本地优先和开放文件格式，不引入私有数据库作为唯一事实源。
- XLSX 当前已具备基础单元格、连续/多区域、当前工作区整行整列、填充柄、公式引用迁移、按需依赖重算、基础样式、持久化行高列宽和合并区域编辑能力；高级样式、更多工作表结构和完整公式等价尚未完成，不能提前宣传为 Excel 等价编辑器；完整等价编辑按兼容矩阵逐项验收。
- PDF 标注和 OCR 使用 sidecar 文件，不直接重写原 PDF。
- OPML 主题、Canvas 节点、PDF 批注和 Table 视图已是全局图谱中的独立对象；本地索引支持持久化全量重建、签名失效检测和页级跨格式全文搜索，尚未实现文件级增量更新。
- 不要提交 `.claude/settings.local.json`、系统凭据、知识库内容、`dist/` 或 `src-tauri/target/`。

## 8. 2026-07-29 E1B 发布状态机恢复点

E1B 发布门禁已升级为 `checkpoint` / `released-preview` 双状态机器，并加入内存正反例验证。当前仍严格保持 `checkpoint`：Word 与 LibreOffice 已验证，WPS 有真实机器阻断证据，`.odt` 未注册且 `write=false`。

后续不得分步或提前暴露 `.odt`。只有 WPS 真实 fixture、同生产者复开和三生产者 `closure-candidate` 桌面证据全部到位，才能在同一提交中把生产者矩阵、`shared/odt-read-contract.json` 和 `shared/file-formats.json` 原子切换为只读发布态；精确合同与反例见 [`E1B_ODT_Release_State_Machine_Audit_2026-07-29.md`](./E1B_ODT_Release_State_Machine_Audit_2026-07-29.md)。

## 9. E1B WPS 跨机器交接入口

当前机器 WPS 仍输出 OLE，不能本机生成合格 ODT。具备可信 WPS ODF 能力的机器现在可以运行 `generate-e1b-odt-producer-fixtures.ps1 -Producer wps` 后使用 `export-e1b-wps-closure-bundle.ps1` 导出固定三成员关闭包；本机使用 `import-e1b-wps-closure-bundle.ps1` 校验固定 DOCX 源摘要、容器和两层 manifest 后导入。导入不会自动修改生产者矩阵或注册表，仍须先完成桌面 `closure-candidate`。

完整命令、正反例和信任边界见 [`E1B_WPS_Portable_Closure_Handoff_Audit_2026-07-29.md`](./E1B_WPS_Portable_Closure_Handoff_Audit_2026-07-29.md)。来源不明的 ZIP 即使摘要自洽也不得接纳。

## 10. E1B WPS 最终能力诊断

2026-07-29 已排除 WPS COM 格式编号误用：本机 `wpsapi.dll` TypeLib 明确注册
`wdFormatOpenDocumentText=23`，但 `SaveAs2(23)` 与 `SaveAs(23)` 均生成 OLE，省略格式的扩展名
推断则生成缺少 ODT `mimetype` 的非 ODT ZIP。环境审计已升级为 schema v2 和三路径保存矩阵，
`check:odt-read-contract` 会固定校验 TypeLib、输出容器和逐项清理状态。

当前结论是 WPS `12.1.0.26895` 没有可工作的 ODT 写出链路，不是 LongEdit 枚举错误。本机诊断
到此收口，后续只接受具备原生 ODT 保存和重开能力的可信 WPS 环境通过严格跨机器交接包补齐
第 3 个生产者；在此之前 E1B 继续保持 2/3，不进入 E1C。详细证据与官方资料复核见
[`E1B_WPS_ODF_Final_Capability_Diagnosis_Audit_2026-07-29.md`](./E1B_WPS_ODF_Final_Capability_Diagnosis_Audit_2026-07-29.md)。

## 11. S8-7E2F Pivot 布局包恢复点

2026-07-29 已完成单行轴、单列轴和 `sum/count/average` 多度量的完整隔离 OOXML 包重写。S8-7E3C 的生产者审计进一步修正隐藏项过滤和原生表头，三种布局现复读 `A3:B6`、`A3:D5`、`A3:J8`，同步验证 Pivot 字段/轴项/数据伪轴、输出值、旧范围清理和输出样式。

该恢复点之后，S8-7E3A 已完成标准 Pivot 可靠新副本；下一入口更新为 S8-7E3B 真实生产者刷新保存往返。多层轴、页面字段、切片器、外部连接和原件覆盖继续阻断。E2F 完整范围见 [`S8_7E2F_XLSX_Pivot_Layout_Package_Rewrite_Audit_2026-07-29.md`](./S8_7E2F_XLSX_Pivot_Layout_Package_Rewrite_Audit_2026-07-29.md)。

## 12. S8-7E3A Pivot 可靠新副本恢复点

标准一行字段、一列字段、一个 `sum` 值字段且无页面筛选的本地 Pivot 已开放“可靠另存新副本”。保存只允许同目录不存在的 `.xlsx`，使用源签名与隔离摘要双重绑定；目标落盘后完成字节、包结构、Pivot 身份/布局/聚合语义复读，源文件保存前后字节、签名和摘要保持不变。

本地完整门禁已通过：前端生产构建、工作簿契约与全部格式证据检查通过，Rust 功能测试 367/367、性能测试 1/1，生产依赖审计为 0 个漏洞。远端 GitHub Quality Gate 以本恢复点提交后的运行记录为准。

下一阶段为 S8-7E3B 真实生产者往返矩阵。多度量和单轴布局虽然已通过隔离包验证，但尚未进入保存白名单；原件覆盖、已有目标替换、页面字段、多层轴、切片器和外部连接继续阻断。详细证据见 [`S8_7E3A_XLSX_Pivot_Reliable_Copy_Save_Audit_2026-07-29.md`](./S8_7E3A_XLSX_Pivot_Reliable_Copy_Save_Audit_2026-07-29.md)。

## 13. S8-7E3B Pivot 三生产者往返恢复点

标准本地 Pivot 的 LongEdit 新副本已通过 Excel、WPS、LibreOffice 3/3 真实刷新、保存、进程退出和新进程重开。每个生产者使用独立副本，均保持 `PivotTable1`、`A3:D7` 和 `D7=4`；版本、会话/进程证据、输出长度和 SHA-256 位于 `docs/evidence/s8-7e3b-xlsx-pivot-roundtrip/matrix.json`。Rust 回归继续从 LongEdit 一侧复读全部四份 XLSX。

本地完整门禁已通过：前端生产构建和全部格式/证据合同通过，Rust 功能测试 368/368、性能测试 1/1，生产依赖审计为 0 个漏洞。远端 GitHub Quality Gate 以本恢复点提交后的运行记录为准。

下一入口为 S8-7E3C：依次评估单行轴、单列轴和三度量可靠新副本，并为每个开放候选重复 3/3 生产者往返。原件覆盖、已有目标替换、多层轴、页面字段、切片器和外部连接继续阻断。详细证据见 [`S8_7E3B_XLSX_Pivot_Producer_Round_Trip_Audit_2026-07-29.md`](./S8_7E3B_XLSX_Pivot_Producer_Round_Trip_Audit_2026-07-29.md)。

## 14. S8-7E3C Pivot 布局新副本恢复点

单行轴、单列轴和 `sum(Field2)/count(Field1)/average(Field2)` 三度量已进入可靠新副本白名单。三份 LongEdit 基准与九份 Excel/WPS/LibreOffice 输出均已版本化；桌面刷新、保存、退出和新进程重开矩阵为 9/9，Rust 从 LongEdit 一侧反向复读十二份 XLSX 的 `PivotTable1`、字段来源和聚合。

真实生产者审计修正了 E2F 的隐藏项和表头假设：基准范围现为 `A3:B6`、`A3:D5`、`A3:J8`。LibreOffice 单列轴会规范化为 `A3:C5`，但保存与新进程重开保持一致，总计语义不变；不宣传跨生产者坐标完全一致。

下一入口为 S8-7E3D：逐项评估 `count/average/max/min/product/countNums` 单度量可靠新副本。原件覆盖、已有目标替换、多层轴、页面字段、切片器和外部连接继续阻断。详细证据见 [`S8_7E3C_XLSX_Pivot_Layout_Copy_Round_Trip_Audit_2026-07-29.md`](./S8_7E3C_XLSX_Pivot_Layout_Copy_Round_Trip_Audit_2026-07-29.md)。

## 15. S8-7E3D Pivot 聚合新副本恢复点

`count/average/max/min/product/countNums` 六种单度量聚合已进入摘要绑定的同目录可靠新副本白名单。六份 LongEdit 基线与十八份 Excel/WPS/LibreOffice 输出已版本化；矩阵 18/18，且每份回存文件都复读 `pivotTable1.xml` 的 `subtotal`，防止聚合静默降级。

本阶段修正跨分组 Grand Total：`average` 加权、`max/min` 取极值、`product` 求积。LongEdit 基线为 `A3:D6`，三生产者刷新后规范化为稳定的 `A3:D7`；聚合、字段来源和总计保持不变。

下一入口为 S8-7E3E 多层轴真实 fixture、结构审计和隔离包原型。页面字段、切片器、外部连接、已有目标覆盖和原件覆盖继续阻断。详细证据见 [`S8_7E3D_XLSX_Pivot_Aggregation_Copy_Round_Trip_Audit_2026-07-29.md`](./S8_7E3D_XLSX_Pivot_Aggregation_Copy_Round_Trip_Audit_2026-07-29.md)。

## 16. S8-7E3E Pivot 多层轴结构恢复点

Microsoft Excel 真实 fixture 已固定 `Region/City` 双层行轴和 `Year/Quarter` 双层列轴。LongEdit 可解码 Excel 的 `r` 前缀压缩层级项，验证双轴明细、父级小计和总计，并从当前源表值生成 16 个完整层级组合。

`audit_workbook_pivot_multi_axis_isolated_copy` 只在内存临时包中重建 Cache Definition 与 Cache Records；包、对象语义和预览分组复读通过，Pivot Definition、输出 Worksheet 和其他未触及部件逐字节不变。命令绑定源签名，成功和旧签名路径均不修改用户文件。

下一入口为 S8-7E3F：把轴模板扩展为有序多层模型，完整重建压缩 `rowItems/colItems` 与层级输出，再覆盖数值变化、类别扩缩容、旧单元格清理和样式延伸。S8-7E3F 仍不开放可靠保存；生产者往返与白名单留到 S8-7E3G。详细证据见 [`S8_7E3E_XLSX_Pivot_Multi_Axis_Structure_Prototype_Audit_2026-07-29.md`](./S8_7E3E_XLSX_Pivot_Multi_Axis_Structure_Prototype_Audit_2026-07-29.md)。

## 17. 接手后直接做什么

当前从 `main` 的 `3907903` 继续，不需要切换其他分支。

1. 进入 S8-7E3F，把现有单层 Pivot 轴模板改为有序多层轴模型。
2. 在临时包中重建多层 `rowItems/colItems`、层级表头、明细、小计和总计。
3. 用已提交的 Microsoft Excel 双层轴 fixture 覆盖数值变化、类别扩张和收缩。
4. 通过包结构、语义、输出值、样式、未触及部件和源文件不变门禁。
5. S8-7E3F 只做隔离包，不开放保存；完成后进入 S8-7E3G，再做 Excel/WPS/LibreOffice 往返并评估可靠新副本。

继续保持阻断：页面字段、切片器、外部连接、已有目标覆盖和原件覆盖。
# 2026-07-30 交接快照：S8-7E3F 已收口

当前 `main` 已推进到 S8-7E3F：XLSX 多层行轴 + 多层列轴 Pivot 可以在临时包中同步重建 Cache Definition/Records、Pivot Definition、压缩 `rowItems/colItems` 和输出 Worksheet。审计命令返回 `multi_axis_output_rebuilt`，输出范围 `A3:I12`，输出单元格 `80`，Grand Total `424`，成功路径和旧签名拒绝路径均不修改用户原文件。

下一步直接进入 S8-7E3G：对 S8-7E3F 的隔离输出包执行 Excel/WPS/LibreOffice 三生产者刷新、保存、退出和新进程重开，验证无修复提示和语义稳定；稳定前不开放多层轴可靠保存，更不开放原文件覆盖。

# 2026-07-30 交接快照：S8-7E3G-A 预检已完成

已新增 `multi_axis` 审计副本生成入口，并固定 LongEdit 基线 `fixtures/xlsx/output-reopen/s8-7e3g-longedit-multi-axis.xlsx`。E3G matrix 位于 `docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/matrix.json`，当前状态为 `blocked_preflight` / `0/3`，原因是本机仅发现 WPS Spreadsheets，未发现 Microsoft Excel 与 LibreOffice Calc。

下一台具备三生产者的机器应直接运行 `npm run audit:s8-7e3g-xlsx-pivot-multi-axis-roundtrip`，补齐 Excel/WPS/LibreOffice 的刷新、保存、退出和新进程重开证据。未达到 3/3 前，可靠保存和原文件覆盖继续阻断。

# 2026-07-30 交接快照：S8-7E3G-B 已完成 WPS 往返

S8-7E3G 已改为可增量执行的生产者矩阵。本机 WPS Spreadsheets `12.0/26895` 已对固定 LongEdit 多层轴基线完成刷新、保存、退出、新会话重开和 LongEdit 反向复读；`MultiAxisPivot`、双层行列轴、`A3:I12` 与 `I12=424` 均保持稳定。证据输出为 `fixtures/xlsx/output-reopen/s8-7e3g-wps-spreadsheets.xlsx`，matrix 已由 `0/3 blocked_preflight` 更新为 `1/3 partial`。

当前可用生产者可运行 `npm run audit:s8-7e3g-xlsx-pivot-multi-axis-available`；三生产者完整门禁仍运行 `npm run audit:s8-7e3g-xlsx-pivot-multi-axis-roundtrip`。下一台具备 Excel 或 LibreOffice 的机器可以用 `scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1 -Producer <id>` 增量补证。只有达到 3/3 后才评估多层轴可靠新副本；原文件覆盖、已有目标覆盖、Page Fields、外部数据和切片器继续阻断。详细审计见 [`S8_7E3G_B_XLSX_Pivot_Multi_Axis_WPS_Round_Trip_Audit_2026-07-30.md`](./S8_7E3G_B_XLSX_Pivot_Multi_Axis_WPS_Round_Trip_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：S8-7E3G-C 已完成 LibreOffice 往返

LibreOffice Calc `26.2.5.2 / cd7284b4cbbfeb507e630c1aac019f4157393acb` 已通过隔离 UNO 运行时完成多层轴 Pivot 刷新、保存、退出、独立配置新进程重开和 LongEdit 反向复读。matrix 当前为 `partial / 2/3`；WPS 与 LibreOffice 均保持 `MultiAxisPivot`、双层行列轴、`A3:I12`、80 个输出单元格、16 个预览分组和 Grand Total `424`。

下一步只补 Microsoft Excel。具备 Excel 的机器直接运行 `scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1 -Producer microsoft-excel`，提交 Excel 输出与更新后的 matrix，再运行完整 `audit:s8-7e3g-xlsx-pivot-multi-axis-roundtrip`。达到 3/3 前可靠新副本继续阻断；达到 3/3 后也只进入白名单评估，不自动开放原文件覆盖。详细审计见 [`S8_7E3G_C_XLSX_Pivot_Multi_Axis_LibreOffice_Round_Trip_Audit_2026-07-30.md`](./S8_7E3G_C_XLSX_Pivot_Multi_Axis_LibreOffice_Round_Trip_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：S8-7E3G-D Excel 身份与证据交接已完成

本机标准 `Excel.Application` CLSID 实际被 WPS `et.exe /Automation` 接管；应用自报 `Microsoft Excel 12.0/26895`，路径却属于 Kingsoft，因此不能作为 Microsoft Excel 证据。新增环境审计与验证器身份门禁，要求 LocalServer 为 Microsoft Office `EXCEL.EXE` 且明确拒绝 Kingsoft/WPS/`et.exe`。当前 matrix 保持 `partial / 2/3`。

最后一项证据现在使用固定三成员 ZIP 交接：可信 Excel 机器运行 `npm run export:s8-7e3g-excel-evidence -- -OutputPath <zip>`；当前开发机人工确认产出来源后运行 `npm run import:s8-7e3g-excel-evidence -- -BundlePath <zip>`。导入绑定 LongEdit 基线摘要、校验生命周期与快照、再次执行 LongEdit 复读、拒绝覆盖并在失败时保持 matrix 不变。详细审计见 [`S8_7E3G_D_XLSX_Pivot_Excel_Identity_and_Evidence_Handoff_Audit_2026-07-30.md`](./S8_7E3G_D_XLSX_Pivot_Excel_Identity_and_Evidence_Handoff_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：S8-7E3G-E Excel 证据协议已加固

Excel 三成员包现已绑定环境身份、producer 版本/构建和输出摘要。新增 CI 自动拒绝矩阵，覆盖额外 ZIP 成员、LongEdit 基线漂移、生命周期门禁缺失和输出摘要篡改；4/4 均确认失败时不创建 Excel 输出且 matrix 字节不变。

当前仍是 `2/3 partial`，没有真实 Excel 证据。下一台可信 Excel 机器继续按 `audit environment → export bundle → 可信传输 → import bundle` 执行。拒绝测试中的 `synthetic-rejection-only` 数据只用于失败路径，绝不能登记为生产者证据。详细审计见 [`S8_7E3G_E_XLSX_Pivot_Excel_Evidence_Protocol_Hardening_Audit_2026-07-30.md`](./S8_7E3G_E_XLSX_Pivot_Excel_Evidence_Protocol_Hardening_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：CI PowerShell 哈希兼容性已修复

远端连续失败已定位为 GitHub Windows Runner 无法识别新证据脚本使用的 `Get-FileHash`。S8-7E3G、X3-B5、X3-B6 的测试、导入、导出和生产者验证现统一使用 `scripts/powershell-sha256.ps1` 的 .NET SHA-256 实现；机器契约会拒绝相关脚本重新引入该 cmdlet。

本地三条证据事务测试与完整 `ci:check` 已通过：Rust 功能测试 `383/383`、性能测试 `1/1`、生产依赖漏洞 `0`。此修复不提升公开能力，Pivot 多层轴仍为 `2/3`、数组公式仍为 `1/3`。远端 Quality Gate 通过后，接手者直接进入 F1/E2A 外部应用能力发现与统一外部打开。详细审计见 [`CI_PowerShell_SHA256_Portability_Audit_2026-07-30.md`](./CI_PowerShell_SHA256_Portability_Audit_2026-07-30.md)。

首次远端复验已证明哈希修复生效，并进一步暴露父 `pwsh` 与子 `powershell.exe` 的 `TEMP` 不一致。现由 `scripts/powershell-path-safety.ps1` 同时识别系统临时目录和 GitHub `RUNNER_TEMP`，且保留严格目录边界检查；X3-B5/X3-B6 针对性事务测试已再次通过。

# 2026-07-30 交接快照：F1 / E2A 已完成

外部应用发现与统一打开已接入主干：Microsoft Office、WPS Office、LibreOffice 通过 App Paths/PATH 发现真实角色程序并读取产品版本；Library 右侧能力栏和文件树菜单共享系统默认/指定应用入口。后端拒绝任意程序路径，只打开工作区内已登记格式，并返回接管前后 SHA-256 不变回执。

本阶段没有提前开放 WPS 原生格式或旧 Office 转换。接手后直接进入 E3：固定 `.wps/.et/.dps` 真实 fixture 和隐私清理规则，登记 `external-open` 能力，接入右侧能力工作面、文件树和最近记录；转换资格保持阻断。详细审计见 [`E2A_External_Application_Discovery_and_Unified_Open_Audit_2026-07-30.md`](./E2A_External_Application_Discovery_and_Unified_Open_Audit_2026-07-30.md)。

# 2026-07-30 交接快照：E3 WPS 原生格式已完成

`.wps/.et/.dps` 已由 WPS Office `12.1.0.26895` 直接生成、脱敏并用新 WPS 实例复开。共享注册表和主窗口右侧 `ExternalOffice` 工作面现在可以确认容器身份，显示大小、修改时间和 SHA-256，并复用 E2A 的系统默认/指定应用外部打开。

三种格式严格保持 `external-open / saveMode:none`；LongEdit 不解析正文、不索引、不转换、不编辑、不创建也不保存。接手后直接进入 E2B `.doc` 隔离转换试点：先做 OLE 预检与风险报告，只允许显式生成新 DOCX 副本并证明源摘要不变；通过后再扩展 E2C `.xls/.ppt`。详细审计见 [`E3_WPS_Native_Recognition_and_External_Open_Audit_2026-07-30.md`](./E3_WPS_Native_Recognition_and_External_Open_Audit_2026-07-30.md)。

远端隔离 Quality Gate `30512714411` 已通过：E3 契约、Rust `391 passed`、XLSX 性能预算、PDF 大文件范围读取和生产依赖审计全部为绿色。
# 2026-07-30 R2 交接入口

R2 Windows 安装与生命周期工程已收口。接手后直接进入 R3 数据韧性与诊断，不再回到格式能力矩阵重做：

1. 先实现索引状态检查、损坏识别、安全重建和重启恢复。
2. 再实现配置/应用元数据备份导出与导入，禁止默认打包知识库正文或凭据。
3. 增加隐私净化诊断包及失败注入契约。
4. R3 完成后进入 R4：正式签名和可抛弃 Windows 10/11 VM 的安装、升级、降级拒绝、卸载保留及文件关联恢复矩阵。

R2 事实源为 `shared/windows-lifecycle-policy.json`，完整审计见 `docs/R2_Windows_Install_and_Lifecycle_Audit_2026-07-30.md`。发布能力页当前显示 R2，`releaseCandidate=false`。

# 2026-07-31 E2A SVG 交接入口

E2A 已完成。SVG 现在是第 40 类注册格式，复用统一 XML 源码工作面，并增加 Rust 安全白名单重写、`<img>` Blob 净化预览、5 MiB 源码预算、16,384 视口预算和签名冲突保护保存。不安全源码只保留在草稿中修复，脚本、事件属性、`foreignObject`、外部引用、处理指令和非白名单元素不能写回。

接手后直接进入 E2B：

1. 冻结 Draw.io 的 mxGraph 压缩/XML 解析合同。
2. 明确外部图片、链接、实体、资源预算和未知属性保留策略。
3. 实现页面与单元格结构模型，再确定可靠副本或受保护覆盖策略。
4. 增加真实 `.drawio` fixture、失败语料、桌面复开和 D2 安全通道证据。

E1B 数组写回和 E1C 多层 Pivot 可靠副本仍分别受 1/3、2/3 外部生产者证据阻断；`releaseCandidate=false` 不变。详细审计见 [`E2A_SVG_Security_and_Basic_Source_Editor_Audit_2026-07-31.md`](./E2A_SVG_Security_and_Basic_Source_Editor_Audit_2026-07-31.md)。

# 2026-07-31 E2B Draw.io 交接入口

E2B 已完成。Draw.io 现在是第 41 类注册格式，`.drawio/.dio` 已接入独立结构化工作面、创建、索引和签名保护保存。后端同时支持直接嵌入与压缩页，页面/单元格解析受资源预算限制；工作面只绘制本地 mxCell 投影，不自动打开链接或加载外部图片。标签、几何和颜色修改只重写目标页，未知属性保持保真，危险资源协议会阻止保存。

接手后直接进入 E5 高级能力最终收口审计：核对 E1A、E2A、E2B、主题承诺、发布矩阵和仍阻塞的外部生产者证据，不继续扩展 Draw.io 功能，也不提升 `releaseCandidate=false`。详细审计见 [`E2B_Drawio_Structured_Editor_Audit_2026-07-31.md`](./E2B_Drawio_Structured_Editor_Audit_2026-07-31.md)。

# 2026-08-01 E5 交接入口

E5 已完成。机器事实源为 `shared/e5-final-capability-closure.json`，完整门禁在基线提交 `313e8701825c29e69de9d0592df1ac462d3921a4` 上通过：Rust 功能回归 431/431、性能回归 1/1、生产依赖漏洞 0。

下一步直接进入 U1 未签名内部候选包：从 E5 通过后的干净 `main` 构建 MSI/NSIS，绑定提交、版本、大小和 SHA-256，并明确保持 internal-only 与 `releaseCandidate=false`。完成 U1 后进入 U2 本机安装生命周期验证；真实签名和 Windows 10/11 隔离证据仍交给 R5N 外部流程。

# 2026-08-01 U1 交接入口

U1 已更新到 1.0.0。`shared/u1-unsigned-internal-candidate-policy.json` 绑定提交 `6f3ce50` 的隔离干净构建，MSI/NSIS 均为 `NotSigned`，哈希与大小已登记，二进制只保存在本机忽略目录。

便携运行烟测因当前会话存在另一份 LongEdit 单实例而记录为 `blocked-existing-single-instance`；没有关闭用户进程、执行安装器或修改注册表。下一步进入 U2 一次性环境的未签名安装生命周期。

# 2026-08-01 U2O handoff

U2O 已完成。GitHub 托管运行 `30664431101` 对源码 `dfe5e9c424ab4a3b71f1eee3924dc43f8f7d400f` 重新构建安装包，并在 Windows Server 2025 一次性环境通过 18 项未签名安装生命周期检查。TXT/JSON 保存重开截图已人工确认位于 Library 右侧工作面，管理备份恢复和知识索引重建也已通过。证据已导入 `docs/evidence/r5k-windows-matrix/imported`。

当前动作是 R5N `execute-signed-windows-10-and-windows-11-client-matrix`。必须使用受信任签名材料和真实 Windows 10/11 客户端；Windows Server 托管证据不得冒充客户端通道，`releaseCandidate=false` 不变。

R5N 环境已在 U2P 再次审计：本机没有签名工具、合格证书或两个客户端 runner。接手机器按 `docs/U2P_R5N_External_Release_Blocker_Audit_2026-08-01.md` 的顺序执行，不得用自签名或 Windows Server 结果替代正式发布证据。

G9 产品线已并行完成首页“知识网络脉搏”：关系覆盖率、已连接/孤立对象、关系类型和高连接主题均来自统一图谱模型，高连接主题可直接打开居中图谱。接手后进入 G10 真实感跨格式资料库桌面验收；不得把合成单元测试登记成真实用户资料库证据。

# 2026-08-01 U2 外部执行入口

U2 已推进到 `execute-on-disposable-windows-runner`。机器事实源为 `shared/u2-disposable-install-lifecycle-policy.json`；U1 NSIS 与 0.6.2 回滚安装器均就绪，但当前主机没有一次性 Windows runner，且已有安装与运行进程，所以安装修改继续阻断。

Sandbox 生成器绑定安装包清单中的产品提交 `6f3ce50`，并可在无 Sandbox 主机上先生成配置。1.0.0 的 U2 证据通过后进入 V1 无 Authenticode 签名社区发布通道；历史 R5N 保留为未来商业签名通道，不再阻止本次社区版发布。
# 2026-08-05 UX-33J 交接入口

UX-33 有界 DOCX 页面编辑已完成安装态收口。U2 运行 `30967710442` 对固定产品提交 `22ac691` 的无签名 `1.0.3` NSIS 完成三类 DOCX 验证，并通过 18/18 安装、卸载、回滚和恢复检查。机器证据位于 `docs/evidence/ux33j-installed-docx-hyperlink`，完整结论见 `docs/A11_DOCX_Installed_Hyperlink_Audit_2026-08-05.md`。

接手后直接进入 UX-34：修复 Drawio/Canvas 的 ResizeObserver 可恢复警告，验证重复切换、缩放、拖动和返回资料库不会弹阻断错误。不要把 UX-33 扩写成完整 Word 等价能力；跨部件 DOCX 对象仍需另立阶段。当前安装包未签名，`releaseCandidate=false`。
# 2026-08-05 UX-34 交接入口

UX-34 Drawio/Canvas 尺寸稳定性已完成。Canvas ResizeObserver 采用单帧合并、尺寸短路和卸载取消；`index.html` 与应用运行时仅阻止两种标准可恢复布局通知，普通错误仍进入原错误页。Tauri Debug WebView2 已完成 6 轮路由、视口、缩放和拖动验证，证据见 `docs/evidence/ux34-drawio-canvas-stability`，完整审计见 `docs/A12_Drawio_Canvas_Resize_Stability_Audit_2026-08-05.md`。

接手后直接进入 UX-35：删除文件树节点重复的原生 `title` 文本提示，只保留统一详情浮层，并确保键盘焦点可以获得同等信息。当前证据不包含用户资料，`releaseCandidate=false`。

# 2026-08-05 UX-35 交接入口

UX-35 文件树详情浮层已完成。节点原生 `title` 已删除，鼠标和键盘方向键当前项共用可访问详情浮层，Esc 与焦点离开可关闭。真实 Tauri Debug WebView2 已验证两个隔离 fixture 均无重复原生提示，运行时异常为 0；证据见 `docs/evidence/ux35-file-tree-preview`，完整审计见 `docs/A13_File_Tree_Detail_Preview_Audit_2026-08-05.md`。

接手后直接进入 UX-36：文件树空白区/目录右键菜单第一项改为“新建”二级菜单，按文档、数据、图表、代码组织格式；重命名必须展示完整文件名并允许修改后缀，格式变化前提示风险、名称冲突时禁止覆盖。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-36 交接入口

UX-36 文件树新建与安全重命名已完成。空白区和目录右键首项统一为“新建”，按四类覆盖格式注册表全部 18 种可创建格式；完整文件名重命名支持已注册后缀变化、明确拒绝同名目标，并在单弹窗内二次确认“不转换内容”。真实 Tauri Debug WebView2 已验证 JSON 创建、冲突拒绝、`.md` 改 `.txt` 及树/标签/路由同步，证据见 `docs/evidence/ux36-file-tree-actions`，完整审计见 `docs/A14_File_Tree_Create_Rename_Audit_2026-08-05.md`。

接手后直接进入 UX-37：审计脑图、思维导图和产品知识图谱的真实画布交互，按平移、缩放、节点拖动、框选、多选、键盘移动、撤销重做、树状/组织/放射/时间线布局逐项补齐并取真实桌面证据。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-37A 交接入口

UX-37A OPML 专业画布已完成。思维导图支持四种布局、三套主题、平移缩放、适合窗口、框选/Ctrl 多选、成组拖动、方向键移动、直接改名及统一撤销重做；自动保存、离开自动保存和投影旁路写盘均已移除。真实 Tauri Debug WebView2 验证两节点拖动、键盘移动与直接改名，未点击保存时源签名不变，运行时异常为 0；证据见 `docs/evidence/ux37a-opml-canvas`，完整审计见 `docs/A15_OPML_Professional_Canvas_Audit_2026-08-05.md`。

接手后进入 UX-37B：在产品知识图谱画布补齐框选、多选、键盘移动、撤销重做和树状/组织/放射/时间线布局。UX-37 总项在 UX-37B 完成前保持进行中；当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-37B 交接入口

UX-37B 产品知识图谱专业画布已完成，UX-37 总项关闭。关系网络支持自动网络、树状、组织、放射、时间线五种布局，专业、多彩、专注三套主题，以及平移缩放、适合窗口、Shift 框选、Ctrl 多选、成组拖动、方向键移动和撤销重做。布局和坐标只写入本地工作区状态，不修改 Markdown；真实 Tauri Debug WebView2 验证 6 节点框选、成组拖动、键盘移动和历史操作，源文件哈希不变，运行时错误为 0。证据见 `docs/evidence/ux37b-knowledge-graph-canvas`，完整审计见 `docs/A16_Knowledge_Graph_Professional_Canvas_Audit_2026-08-05.md`。

接手后进入 UX-38 全格式验收：按格式能力矩阵逐项核查真实文件打开、编辑、显式保存、撤销重做、主题、窄窗口和返回上下文，优先覆盖尚无统一真实桌面证据的格式。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-38A 交接入口

UX-38A 已建立覆盖 41/41 个格式族、12 个体验维度的机器可检查矩阵，并在真实 Tauri Debug WebView2 中完成 24 个轻量格式的受管打开与加载验收。24/24 通过，最长加载 2041 ms，运行时错误和阻断界面均为 0，源文件哈希全部不变；证据见 `docs/evidence/ux38a-lightweight-formats`，审计见 `docs/A17_UX38A_Lightweight_Format_Matrix_Audit_2026-08-05.md`。

UX-38 总项仍在进行中。视觉审计确认多标签会继续压缩并暴露原生滚动条，标签维度只能标记为部分通过。接手后进入 UX-38B，先统一修复 UX-09、UX-10、UX-17：标签保持可读最小宽度、滚轮/触控板横向滚动、隐藏原生轨道并提供边缘反馈；之后再继续数据表格、Office、图形和外部依赖格式。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-38B 交接入口

UX-38B 工作区标签滚动已完成，UX-09、UX-10、UX-17 关闭。标签采用 176px 固定宽度和 156px 最小保护宽度，隐藏原生轨道，支持滚轮、Shift+滚轮、触控板主方向增量、左右边缘按钮、活动项自动显露和方向键导航。真实 Tauri Debug WebView2 已用 12 个文件完成宽屏、滚动和 1000x720 窄窗口验收，运行时错误为 0，源文件哈希不变；证据见 `docs/evidence/ux38b-workspace-tabs`，审计见 `docs/A18_UX38B_Workspace_Tab_Scrolling_Audit_2026-08-05.md`。

UX-38 总项仍在进行中。接手后进入 UX-38C 数据表格格式族，依次核查 Table、CSV/TSV、XLSX、ODS 的打开、加载与异常状态、内存编辑与显式保存、主题和冻结层、窄窗口、键盘及返回上下文。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-38C1 交接入口

UX-38C1 CSV/TSV/Table 网格体验已完成。冻结控制支持 0 至 12 列并按累计列宽定位，冻结表头、数据格和行号改用不透明主题表面；行号选择与应用内删除确认完成实机复测；“创建 Table 副本”会先说明目标名称、目录和原文件不变，完成后可打开或在文件树定位。工具栏还会按工作区容器宽度换行。真实 Tauri Debug WebView2 的 CSV/TSV 验收运行时错误为 0，源文件哈希不变；证据见 `docs/evidence/ux38c-table-grid`，审计见 `docs/A19_UX38C1_Table_Grid_Experience_Audit_2026-08-05.md`。

UX-38 总项继续进行。接手后进入 UX-38C2：真实复测 XLSX/ODS 的冻结层、紧凑布局、主题、窄窗口和异常状态，并覆盖图谱返回后的 CSV/TSV/XLSX 活动文件、滚动位置与 Sheet 上下文，判断 UX-12、UX-32 是否可以关闭。当前证据不含用户资料与完整本机路径，`releaseCandidate=false`。

# 2026-08-05 UX-38C2 交接入口

UX-38C2 已完成，数据表格格式族收口，UX-12、UX-13、UX-32 关闭。XLSX 与 ODS 采用工作区容器响应布局和不透明冻结层，并持续记忆滚动位置与活动 Sheet；CSV/TSV 修正加载态恢复时机。真实 Tauri Debug WebView2 已验证 CSV、TSV、XLSX、ODS 从知识图谱返回后的活动文件与滚动上下文，XLSX/ODS 同时恢复目标 Sheet；运行时错误为 0，源文件哈希不变。证据见 `docs/evidence/ux38c2-workbook-context`，审计见 `docs/A20_UX38C2_Workbook_Context_Audit_2026-08-05.md`。

UX-38 总项继续进行。接手后进入 UX-38D 文档媒体格式族，依次验收 PDF、DOCX/ODT、PPTX/ODP 的真实打开、模式切换、保存边界、主题、窄窗口、键盘和返回上下文。不得把有界 Office 能力写成完整等价编辑；当前 `releaseCandidate=false`。

# 2026-08-05 UX-38D1 交接入口

UX-38D1 PDF 工作区已完成。PDF 现在持续记忆当前页、双向滚动、缩放、适合宽度及侧栏状态，并在知识图谱往返后恢复；工具栏按工作区容器宽度折行，窄宽度侧栏标签采用两行紧凑布局。真实 Tauri Debug WebView2 在 220% 缩放下完成图谱返回与 900x720 窄窗口验收，运行时错误为 0，源 PDF 哈希不变。证据见 `docs/evidence/ux38d1-pdf-workspace`，审计见 `docs/A21_UX38D1_PDF_Workspace_Audit_2026-08-05.md`。

UX-38 总项仍在进行中。接手后进入 UX-38D2，验收 DOCX/ODT 的打开、加载与异常状态、页面式编辑或结构化只读边界、显式保存/可靠副本、主题、窄窗口、键盘和返回上下文。PDF 原文只读、sidecar 批注及可靠新副本边界保持不变；当前 `releaseCandidate=false`。

# 2026-08-05 UX-38D2 交接入口

UX-38D2 DOCX 受管工作区已完成。DOCX/ODT 均记忆正文滚动，DOCX 还恢复编辑面板与模式；两者改为按实际工作区容器宽度响应。DOCX 注册表、发布矩阵和安全合同已对齐现有“内存草稿、隔离验证、用户确认后有界覆盖或可靠另存”能力。真实 Tauri Debug WebView2 验证 DOCX 图谱往返、820x720 编辑布局和 ODT 760x720 直接只读预览，运行时错误为 0，源文件哈希不变。证据见 `docs/evidence/ux38d2-document-workspace`，审计见 `docs/A22_UX38D2_Document_Workspace_Audit_2026-08-05.md`。

ODT 仍是预览路由且未注册：Word/LibreOffice 通过，WPS 生产者门禁为 2/3，不得宣称资料库已正式开放。UX-38 下一步进入 UX-38D3，验收 PPTX/ODP 的模式、可靠副本、主题、窄窗口、键盘和返回上下文；当前 `releaseCandidate=false`。

# 2026-08-05 UX-38D3 交接入口

UX-38D3 PPTX/ODP 工作区已完成，文档媒体格式族收口。PPTX 现在记忆当前幻灯片、详情面板与画布滚动，并按实际工作区宽度响应；ODP 记忆当前幻灯片，且加载态不会再覆盖历史上下文。真实 Tauri Debug WebView2 已验证两种格式从知识图谱返回、窄窗口与源文件不变，运行时错误为 0；证据见 `docs/evidence/ux38d3-presentation-workspace`，完整结论见 `docs/A23_UX38D3_Presentation_Workspace_Audit_2026-08-05.md`。

接手后进入 UX-38E 图形画布格式族，按 Canvas、Draw.io、Diagram、OPML 的顺序核对打开、显式保存、撤销重做、主题、窄窗口、键盘和返回上下文，优先复用 UX-34/UX-37 已有真实证据并只补缺口。PPTX 仍只能可靠另存副本，ODP 仍为只读，`releaseCandidate=false` 不变。

# 2026-08-05 UX-38E 交接入口

UX-38E 图形工作区已完成。Canvas、Draw.io、Mermaid、OPML 均已验证内存草稿、显式保存和知识图谱往返上下文；Canvas、Draw.io、Mermaid 本轮通过撤销重做，OPML 复用 UX-37A 已接受证据。真实 Tauri WebView2 审计运行时错误和意外弹窗均为 0，证据见 `docs/evidence/ux38e-graphics-workspace`，完整结论见 `docs/A24_UX38E_Graphics_Workspace_Audit_2026-08-05.md`。

接手后进入 UX-38F：只收口 `.doc/.xls/.ppt/.wps/.et/.dps` 的外部应用发现、不可用状态、失败说明、返回上下文与窄窗口，不宣称 LongEdit 内部等价编辑或转换。UX-38F 完成后执行 UX-38 总矩阵最终审计；当前 `releaseCandidate=false`。

# 2026-08-05 UX-38F 交接入口

UX-38F 外部 Office 工作区已完成。`.doc/.xls/.ppt/.wps/.et/.dps` 均在工作区内展示系统默认、Microsoft Office、WPS Office、LibreOffice 的可用或不可用状态，并提供用户主动触发的安全外部交接；旧 Office 的隔离转换入口与外部打开已明确分区。真实 Tauri WebView2 已验证六格式加载、图谱往返、应用选择或目标路径恢复、760x720 窄布局与源哈希不变，运行时错误和意外弹窗均为 0。证据见 `docs/evidence/ux38f-external-office`，完整结论见 `docs/A25_UX38F_External_Office_Workspace_Audit_2026-08-05.md`。

接手后执行 UX-38 总矩阵最终审计：清点 41/41 格式的证据和所有 `partial/referenced/not-applicable` 边界，只关闭有真实证据支持的项目，不扩大有限 Office、外部打开或只读预览能力。当前 `releaseCandidate=false`。

# 2026-08-05 UX-38 最终交接入口

UX-38 全格式体验阶段已按有界能力完成。矩阵覆盖 41/41 格式、10 个实际档案和 12 个体验维度，状态合计为 75 accepted、32 partial、7 referenced、6 not-applicable、0 pending；两个无人引用的历史占位档案已移除。所有有限项都有明确能力边界，因此不得把阶段收口解读为完整 Office/Excel/Draw.io 等价。机器事实见 `shared/ux38-final-closure.json`，完整审计见 `docs/A26_UX38_Final_Format_Experience_Closure_2026-08-05.md`。

接手后进入 UX-39 无签名打包与安装回归：产品开发版本已提升到 `1.0.4`，从冻结的干净 `main` 构建 MSI/NSIS，重点复测启动时无控制台弹窗、安装界面与开发界面一致，以及 UX-38 各工作区在安装态的关键路径。没有真实签名时只保持无签名社区构建，`releaseCandidate=false`；不得把本阶段误打包为 `1.0.3`，也不得在验收前提前宣称 v1.0.4 已发布。

UX-39A 已完成 v1.0.4 本地产物审计：源码提交 `1bec297` 生成 MSI/NSIS，版本资源、文件名、SHA-256、`NotSigned` 状态和无更新附件边界均已核对。由于本机已有安装实例运行，未中断用户状态强行做便携烟测；隔离安装回归已派发到 GitHub Actions 运行 `30989527026`。下一步导入该运行的安装态证据，通过前不得发布 v1.0.4。详见 [`UX39A_Unsigned_Package_Artifact_Audit_2026-08-05.md`](./UX39A_Unsigned_Package_Artifact_Audit_2026-08-05.md)。

# 2026-08-06 UX-39 发布交接入口

UX-39 已完成安装包与安装态回归收口。最终产品源码提交为 `2b5d4d750da0f3e3ee913a4cc461784ffa8ea947`；GitHub Actions 运行 `31062756515` 通过 18/18 安装生命周期、15/15 安装态功能和 11/11 路由挂载检查。此前两个失败运行暴露的后台路由兜底和预发布能力矩阵版本冲突均已修复，不再作为阻断项。

最终公开候选为 `LongEdit_1.0.4_x64-setup.exe`（SHA-256 `cd68e19d9daab198f9bca7f97d3eeb432314f5f3e7895295845e7b48d4b29ff3`）与 `LongEdit_1.0.4_x64_zh-CN.msi`（SHA-256 `dacbd99ed0f6fe148bdecb99378cf49b4afd68f16e9dcc4b5492233b1e358ee9`）。两者均为 `NotSigned`，只允许与 `SHA256SUMS.txt` 一起手动发布，不上传 `latest.json` 或 `.sig`。

接手后只需完成 `v1.0.4` 标签与 GitHub Release、下载复核公开附件，并把发布 URL、时间和标签提交写回 `shared/v1-community-release-policy.json`。完整证据见 [`UX39B_Installed_Lifecycle_Closure_Audit_2026-08-06.md`](./UX39B_Installed_Lifecycle_Closure_Audit_2026-08-06.md)。

## v1.0.4 发布回执

`v1.0.4` 已于 `2026-08-06T02:06:55Z` 正式发布，标签指向提交 `acfc86b937307eee70e8063884ef405ba2c0a7fa`。Release 地址为 <https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.4>。NSIS、MSI 和 `SHA256SUMS.txt` 已从远端重新下载复核，公开哈希与发布候选完全一致。

接手后进入 v1.0.4 稳定性观察，不再重复打包 1.0.3 或 1.0.4。只处理真实可复现回归；后续产品阶段继续推进完整 Excel、高级 Office 编辑、更多原生格式和主题深化。自动更新私钥边界不变，仍不发布 `latest.json` 或 `.sig`。

# 2026-08-06 UX-40 交接入口

v1.0.4 安装反馈确认文档 Tab 切换被全局路由遮罩和 `out-in` 串行转场人为阻塞。UX-40 已删除全屏路由遮罩，启动与文档导航遮罩预算均改为 0ms，并移除跨格式工作区的串行退场；性能记录仍保留但不再影响交互。生产构建、R5B 性能合同和当前完整审计链均通过，详见 [`UX40_Document_Switching_Performance_Audit_2026-08-06.md`](./UX40_Document_Switching_Performance_Audit_2026-08-06.md)。

该修复位于 `main`，已发布的 `v1.0.4` 安装器不包含它。接手后应先用真实安装包复测 Markdown/TXT 同路由切换以及 TXT/JSON/PDF/XLSX 跨格式切换，再决定后续补丁版本；不得把当前源码修复误报为已交付给 v1.0.4 用户。

UX-40 深入审计后已进一步收紧：全屏路由遮罩现已从产品中彻底删除；应用外壳先于配置 IPC 挂载，关键启动调用均有 2-8 秒边界；路由导入失败保留当前页面并显示非阻塞恢复条；Markdown/TXT 快速切换使用请求代次防止旧读取覆盖新文档。新增 `check:navigation-liveness` 并进入当前开发审计链。下一步必须在新安装包中做连续快速切换与故障恢复验证，不能只依赖源码门禁。

提交 `676baa7` 已完成真实 Tauri Debug WebView2 回归：隔离资料库中的 12 种文本/开发格式连续切换、滚轮、键盘、活动标签回显与窄窗口均通过，运行时错误、阻断错误界面和源文件变化均为 0。摘要位于 `docs/evidence/ux40-navigation-liveness/runtime-summary.json`；安装态重型格式回归仍是下一安装包的发布前置条件。

UX-21 已移除资料库编辑区右上角的当前文件关系状态块，不再显示关系数量、入链数量或“孤立风险”，并停止为活动文件单独加载该摘要。关系能力仍可从工作台、知识搜索结果和按需关系界面进入。

UX-18 按用户澄清保留右侧文件上下文按钮，但删除应用内容区固定的 42px 全高预留列。按钮关闭时仅贴边悬浮，关系面板只在展开后获得 326px 宽度并覆盖显示，不再压缩各格式编辑区域。
